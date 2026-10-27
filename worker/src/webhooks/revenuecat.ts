import { productById } from "../catalog";
import { hmacSha256Hex, presentSecret, secretsEqual } from "../crypto";
import { asRecord, json, readBoundedBytes } from "../http";
import { logError, logInfo } from "../log";
import { nowIso } from "../time";

const GRANT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Accept either RevenueCat's static Authorization header (set to the same
 * value as REVENUECAT_WEBHOOK_SECRET) or X-RevenueCat-Signature as
 * hex HMAC-SHA256 of the raw body.
 */
export async function revenueCatAuthorized(secret: string, request: Request, raw: Uint8Array): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (authorization) {
    const full = await secretsEqual(authorization, secret);
    const stripped = await secretsEqual(authorization.replace(/^Bearer\s+/i, ""), secret);
    if (full || stripped) return true;
  }
  const signature = request.headers.get("X-RevenueCat-Signature");
  if (!signature) return false;
  const expected = await hmacSha256Hex(secret, raw);
  const presented = signature.trim().toLowerCase().replace(/^sha256=/, "");
  return secretsEqual(presented, expected);
}

interface ParsedEvent {
  id: string;
  type: string;
  appUserId: string | null;
  productId: string | null;
  expiresAt: string | null;
}

function parseEvent(payload: unknown): ParsedEvent | { error: string } {
  const root = asRecord(payload);
  if (!root) return { error: "invalid_event" };
  const event = asRecord(root.event ?? root);
  if (!event) return { error: "invalid_event" };
  if (typeof event.id !== "string" || !/^[A-Za-z0-9:_./-]{1,128}$/.test(event.id)) {
    return { error: "invalid_event_id" };
  }
  if (typeof event.type !== "string" || !/^[A-Z0-9_]{1,64}$/.test(event.type)) {
    return { error: "invalid_event_type" };
  }
  let appUserId: string | null = null;
  if (typeof event.app_user_id === "string" && UUID_RE.test(event.app_user_id)) {
    appUserId = event.app_user_id.toLowerCase();
  }
  let productId: string | null = null;
  if (typeof event.product_id === "string" && PRODUCT_RE.test(event.product_id)) {
    productId = event.product_id;
  }
  let expiresAt: string | null = null;
  if (typeof event.expiration_at_ms === "number" && Number.isFinite(event.expiration_at_ms)) {
    expiresAt = new Date(event.expiration_at_ms).toISOString();
  }
  return { id: event.id, type: event.type, appUserId, productId, expiresAt };
}

async function recordEvent(
  env: Env,
  event: ParsedEvent,
  applied: 0 | 1,
  reason: string,
): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO revenuecat_events (id, app_user_id, event_type, product_id, applied, reason, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (id) DO UPDATE SET
       applied = excluded.applied,
       reason = excluded.reason,
       product_id = excluded.product_id
     WHERE revenuecat_events.applied = 0`,
  ).bind(event.id, event.appUserId, event.type, event.productId, applied, reason, now).run();
}

export async function handleRevenueCat(request: Request, env: Env): Promise<Response> {
  const raw = await readBoundedBytes(request, 256 * 1024);
  if (!raw.ok) return raw.response;
  const secret = presentSecret(env.REVENUECAT_WEBHOOK_SECRET);
  if (!secret) {
    return json({
      error: "webhook_not_configured",
      todo: "Set REVENUECAT_WEBHOOK_SECRET with wrangler secret put. Unsigned webhooks are rejected.",
    }, 503);
  }
  if (!(await revenueCatAuthorized(secret, request, raw.bytes))) {
    return json({ error: "invalid_signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw.bytes)) as unknown;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = parseEvent(payload);
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  const existing = await env.DB.prepare(
    `SELECT applied FROM revenuecat_events WHERE id = ?1`,
  ).bind(parsed.id).first<{ applied: number }>();
  if (existing?.applied === 1) {
    logInfo("revenuecat", { eventType: parsed.type, applied: true, duplicate: true });
    return json({ ok: true, duplicate: true });
  }

  let applied: 0 | 1 = 0;
  let reason = "ignored";
  try {
    if (parsed.type === "TEST") {
      reason = "test_event";
    } else if (parsed.type === "CANCELLATION") {
      reason = "cancellation_keeps_access_until_expiration";
    } else if (!parsed.appUserId) {
      reason = "app_user_id_must_be_internal_uuid";
    } else if (parsed.type === "EXPIRATION" || parsed.type === "BILLING_ISSUE") {
      if (!parsed.productId) {
        reason = "missing_product";
      } else {
        const status = parsed.type === "EXPIRATION" ? "expired" : "grace";
        const from = parsed.type === "EXPIRATION" ? "('active', 'grace')" : "('active')";
        const result = await env.DB.prepare(
          `UPDATE entitlements
           SET status = ?1, updated_at = ?2
           WHERE user_id = ?3 AND product_id = ?4 AND status IN ${from}`,
        ).bind(status, nowIso(), parsed.appUserId, parsed.productId).run();
        applied = 1;
        reason = result.meta.changes > 0 ? status : "no_matching_entitlement";
      }
    } else if (GRANT_TYPES.has(parsed.type)) {
      const product = parsed.productId ? productById(parsed.productId) : undefined;
      if (!product) {
        reason = "unknown_product";
      } else if (!parsed.expiresAt) {
        reason = "missing_expiration";
      } else {
        const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?1`).bind(parsed.appUserId).first();
        if (!user) {
          reason = "unknown_user";
        } else {
          const now = nowIso();
          await env.DB.prepare(
            `INSERT INTO entitlements (
               id, user_id, tier, product_id, price_cents, status, source,
               expires_at, revenuecat_event_id, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'active', 'revenuecat', ?6, ?7, ?8, ?8)
             ON CONFLICT (id) DO UPDATE SET
               tier = excluded.tier,
               product_id = excluded.product_id,
               price_cents = excluded.price_cents,
               status = 'active',
               expires_at = excluded.expires_at,
               updated_at = excluded.updated_at`,
          ).bind(
            `rc:${parsed.id}`,
            parsed.appUserId,
            product.tier,
            product.productId,
            product.priceCents,
            parsed.expiresAt,
            parsed.id,
            now,
          ).run();
          applied = 1;
          reason = "granted";
        }
      }
    } else {
      reason = "ignored_type";
    }
    await recordEvent(env, parsed, applied, reason);
  } catch (error) {
    logError("revenuecat_failed", error);
    return json({ error: "internal" }, 500);
  }

  logInfo("revenuecat", { eventType: parsed.type, applied: applied === 1, duplicate: false });
  return json({ ok: true, duplicate: false, applied: applied === 1, reason });
}

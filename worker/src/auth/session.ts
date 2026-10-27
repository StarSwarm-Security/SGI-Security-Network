import { json } from "../http";
import { logError } from "../log";
import { randomToken, sha256Hex } from "../crypto";
import { loadEntitlement } from "../entitlements/load";
import { addDaysIso, nowIso } from "../time";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_DAYS = 30;

export interface Session {
  deviceId: string;
  userId: string;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function requireSession(
  request: Request,
  env: Env,
): Promise<{ ok: true; session: Session } | { ok: false; response: Response }> {
  const token = bearerToken(request);
  if (!token) return { ok: false, response: json({ error: "unauthorized" }, 401) };
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT device_id, user_id, expires_at
     FROM device_sessions
     WHERE token_hash = ?1`,
  ).bind(tokenHash).first<{ device_id: string; user_id: string; expires_at: string }>();
  const now = nowIso();
  if (!row || row.expires_at <= now) {
    return { ok: false, response: json({ error: "unauthorized" }, 401) };
  }
  await env.DB.prepare(`UPDATE devices SET last_seen_at = ?1 WHERE id = ?2`).bind(now, row.device_id).run();
  return { ok: true, session: { deviceId: row.device_id, userId: row.user_id } };
}

function isConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /UNIQUE|constraint/i.test(message);
}

/**
 * Anonymous free-tier device. The device id is an identifier, not a secret.
 * Repeating it does not mint another session. The bearer token is the secret
 * and only its hash is stored.
 *
 * TODO(Phase 1): Play Integrity / App Attest before raising rate limits.
 * Do not key limits on IP addresses.
 */
export async function createAnonymousDevice(env: Env, requestedId: string | undefined): Promise<Response> {
  let deviceId: string;
  if (requestedId === undefined) {
    deviceId = crypto.randomUUID();
  } else if (!UUID_RE.test(requestedId)) {
    return json({ error: "invalid_device_id" }, 400);
  } else {
    deviceId = requestedId.toLowerCase();
  }

  const userId = crypto.randomUUID();
  const now = nowIso();
  const expiresAt = addDaysIso(SESSION_DAYS);
  const sessionToken = randomToken();
  const tokenHash = await sha256Hex(sessionToken);
  const entitlementId = crypto.randomUUID();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, auth_provider, provider_subject, created_at, updated_at)
         VALUES (?1, 'anonymous', NULL, ?2, ?2)`,
      ).bind(userId, now),
      env.DB.prepare(
        `INSERT INTO devices (id, user_id, created_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?3)`,
      ).bind(deviceId, userId, now),
      env.DB.prepare(
        `INSERT INTO entitlements (
           id, user_id, tier, product_id, price_cents, status, source,
           expires_at, revenuecat_event_id, created_at, updated_at
         ) VALUES (?1, ?2, 'free', NULL, 0, 'active', 'default', NULL, NULL, ?3, ?3)`,
      ).bind(entitlementId, userId, now),
      env.DB.prepare(
        `INSERT INTO device_sessions (token_hash, device_id, user_id, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(tokenHash, deviceId, userId, now, expiresAt),
    ]);
  } catch (error) {
    if (isConflict(error)) return json({ error: "device_exists" }, 409);
    logError("device_create_failed", error);
    return json({ error: "internal" }, 500);
  }

  const entitlement = await loadEntitlement(env, userId);
  return json({
    deviceId,
    userId,
    sessionToken,
    tokenType: "bearer",
    expiresAt,
    entitlement,
  }, 201);
}

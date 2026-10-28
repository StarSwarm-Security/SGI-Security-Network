import { ANALYZE_MAX_TEXT_BYTES, ANALYZE_PER_DAY, isDeviceType, type DeviceType } from "../catalog";
import { sha256Hex } from "../crypto";
import { loadEntitlement } from "../entitlements/load";
import { asRecord, json, readJson } from "../http";
import { logError } from "../log";
import { utcDay } from "../time";
import type { Session } from "../auth/session";
import { llmStatus } from "./llm";
import { runOffline } from "./offline";

const MAX_BODY = ANALYZE_MAX_TEXT_BYTES + 2048;
const MAX_CACHED_JSON = 500_000;

async function consumeCredit(
  env: Env,
  session: Session,
  limit: number,
): Promise<{ ok: true; count: number } | { ok: false }> {
  const row = await env.DB.prepare(
    `INSERT INTO analyze_usage (device_id, user_id, window_start, request_count)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (device_id, window_start)
     DO UPDATE SET request_count = request_count + 1
     WHERE analyze_usage.request_count < ?4
     RETURNING request_count`,
  ).bind(session.deviceId, session.userId, utcDay(), limit).first<{ request_count: number }>();
  if (!row) return { ok: false };
  return { ok: true, count: row.request_count };
}

export async function handleAnalyze(request: Request, env: Env, session: Session): Promise<Response> {
  const parsed = await readJson(request, MAX_BODY);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  if (!body || typeof body.text !== "string") return json({ error: "invalid_body" }, 400);
  const text = body.text.replace(/\r\n/g, "\n");
  if (text.trim().length === 0) return json({ error: "empty_input" }, 400);
  if (new TextEncoder().encode(text).byteLength > ANALYZE_MAX_TEXT_BYTES) {
    return json({ error: "payload_too_large", maxBytes: ANALYZE_MAX_TEXT_BYTES }, 413);
  }

  const mode = body.mode === undefined ? "config" : body.mode;
  if (mode !== "config" && mode !== "paste") return json({ error: "invalid_mode" }, 400);
  let deviceType: DeviceType = "auto";
  if (mode === "config" && body.deviceType !== undefined) {
    if (typeof body.deviceType !== "string" || !isDeviceType(body.deviceType)) {
      return json({ error: "invalid_device_type" }, 400);
    }
    deviceType = body.deviceType;
  }

  const entitlement = await loadEntitlement(env, session.userId);
  const limit = entitlement.analyzePerDay || ANALYZE_PER_DAY.free;
  const credit = await consumeCredit(env, session, limit);
  if (!credit.ok) {
    return json({ error: "rate_limited", tier: entitlement.tier, limit, window: "utc_day" }, 429, {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
    });
  }

  const contentHash = await sha256Hex(`${mode}\n${deviceType}\n${text}`);
  const cachedRow = await env.DB.prepare(
    `SELECT result_json FROM analyze_cache WHERE content_hash = ?1`,
  ).bind(contentHash).first<{ result_json: string }>();

  let result: unknown;
  let cached = false;
  if (cachedRow) {
    try {
      result = JSON.parse(cachedRow.result_json) as unknown;
      cached = true;
      await env.DB.prepare(
        `UPDATE analyze_cache SET hit_count = hit_count + 1 WHERE content_hash = ?1`,
      ).bind(contentHash).run();
    } catch (error) {
      logError("analyze_cache_corrupt", error);
      result = undefined;
    }
  }
  if (result === undefined) {
    try {
      result = runOffline(mode, text, deviceType);
    } catch (error) {
      logError("analyze_failed", error);
      return json({ error: "analyze_failed" }, 500);
    }
    const stored = JSON.stringify(result);
    if (stored.length <= MAX_CACHED_JSON) {
      await env.DB.prepare(
        `INSERT INTO analyze_cache (content_hash, mode, result_json, created_at, hit_count)
         VALUES (?1, ?2, ?3, ?4, 0)
         ON CONFLICT (content_hash) DO NOTHING`,
      ).bind(contentHash, mode, stored, new Date().toISOString()).run();
    }
  }

  const remaining = Math.max(0, limit - credit.count);
  return json({
    cached,
    contentHash,
    mode,
    result,
    llm: llmStatus(env),
    usage: { limit, remaining, tier: entitlement.tier },
    note: mode === "paste"
      ? "Server Paste Guard mirrors the on-device rules. The Pages app does not call this route, so Phase 0 pastes still stay in the browser. Cached rows store findings, not a raw-paste column."
      : "Server Analyze mirrors js/analyzers.js. Cached rows store findings, not a raw-paste column.",
  }, 200, {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
  });
}

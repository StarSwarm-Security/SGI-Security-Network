import { TRIAL_DAYS, TRIAL_PRODUCT_ID } from "../catalog";
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

function conflictKind(error: unknown): "user" | "device" | "other" | null {
  if (!isConflict(error)) return null;
  const message = error instanceof Error ? error.message : "";
  if (/provider_subject|users_provider_subject/i.test(message)) return "user";
  if (/devices/i.test(message)) return "device";
  return "other";
}

interface SessionMaterial {
  sessionToken: string;
  tokenHash: string;
  expiresAt: string;
}

async function newSessionMaterial(): Promise<SessionMaterial> {
  const sessionToken = randomToken();
  return {
    sessionToken,
    tokenHash: await sha256Hex(sessionToken),
    expiresAt: addDaysIso(SESSION_DAYS),
  };
}

/**
 * First account for a provider. The bearer token is the secret and only its
 * hash is stored. The first session starts a 3-day Pro trial (same analyze
 * limits as monthly) and a free entitlement with no expiry. When the trial
 * expires, loadEntitlement falls back to that free row. The trial is not a charge.
 *
 * Analyze rate limits stay per device and UTC day for every session minted here,
 * anonymous or Google. Do not key limits on IP addresses.
 * TODO(Phase 1): Play Integrity / App Attest before raising rate limits.
 */
function newAccountStatements(
  env: Env,
  input: {
    userId: string;
    authProvider: "anonymous" | "google";
    providerSubject: string | null;
    deviceId: string;
    now: string;
    session: SessionMaterial;
  },
) {
  const freeEntitlementId = crypto.randomUUID();
  const trialEntitlementId = crypto.randomUUID();
  const trialExpiresAt = addDaysIso(TRIAL_DAYS);
  const userInsert = input.providerSubject === null
    ? env.DB.prepare(
        `INSERT INTO users (id, auth_provider, provider_subject, created_at, updated_at)
         VALUES (?1, 'anonymous', NULL, ?2, ?2)`,
      ).bind(input.userId, input.now)
    : env.DB.prepare(
        `INSERT INTO users (id, auth_provider, provider_subject, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)`,
      ).bind(input.userId, input.authProvider, input.providerSubject, input.now);
  return [
    userInsert,
    env.DB.prepare(
      `INSERT INTO devices (id, user_id, created_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?3)`,
    ).bind(input.deviceId, input.userId, input.now),
    env.DB.prepare(
      `INSERT INTO entitlements (
         id, user_id, tier, product_id, price_cents, status, source,
         expires_at, revenuecat_event_id, created_at, updated_at
       ) VALUES (?1, ?2, 'free', NULL, 0, 'active', 'default', NULL, NULL, ?3, ?3)`,
    ).bind(freeEntitlementId, input.userId, input.now),
    env.DB.prepare(
      `INSERT INTO entitlements (
         id, user_id, tier, product_id, price_cents, status, source,
         expires_at, revenuecat_event_id, created_at, updated_at
       ) VALUES (?1, ?2, 'trial', ?3, 0, 'active', 'trial', ?4, NULL, ?5, ?5)`,
    ).bind(trialEntitlementId, input.userId, TRIAL_PRODUCT_ID, trialExpiresAt, input.now),
    env.DB.prepare(
      `INSERT INTO device_sessions (token_hash, device_id, user_id, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(input.session.tokenHash, input.deviceId, input.userId, input.now, input.session.expiresAt),
  ];
}

async function sessionResponse(
  env: Env,
  fields: { deviceId: string; userId: string; sessionToken: string; expiresAt: string },
  status: number,
): Promise<Response> {
  const entitlement = await loadEntitlement(env, fields.userId);
  return json({
    deviceId: fields.deviceId,
    userId: fields.userId,
    sessionToken: fields.sessionToken,
    tokenType: "bearer",
    expiresAt: fields.expiresAt,
    entitlement,
  }, status);
}

function normalizeDeviceId(
  requested: string | undefined,
): { ok: true; deviceId: string | undefined } | { ok: false; response: Response } {
  if (requested === undefined) return { ok: true, deviceId: undefined };
  if (!UUID_RE.test(requested)) return { ok: false, response: json({ error: "invalid_device_id" }, 400) };
  return { ok: true, deviceId: requested.toLowerCase() };
}

/**
 * Anonymous device. The device id is an identifier, not a secret.
 * Repeating it does not mint another session.
 */
export async function createAnonymousDevice(env: Env, requestedId: string | undefined): Promise<Response> {
  const normalized = normalizeDeviceId(requestedId);
  if (!normalized.ok) return normalized.response;
  const deviceId = normalized.deviceId ?? crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = nowIso();
  const session = await newSessionMaterial();

  try {
    await env.DB.batch(newAccountStatements(env, {
      userId,
      authProvider: "anonymous",
      providerSubject: null,
      deviceId,
      now,
      session,
    }));
  } catch (error) {
    if (isConflict(error)) return json({ error: "device_exists" }, 409);
    logError("device_create_failed", error);
    return json({ error: "internal" }, 500);
  }

  return sessionResponse(env, {
    deviceId,
    userId,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  }, 201);
}

async function findGoogleUser(env: Env, subject: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM users WHERE auth_provider = 'google' AND provider_subject = ?1`,
  ).bind(subject).first<{ id: string }>();
  return row?.id ?? null;
}

async function linkGoogleSession(env: Env, userId: string, requestedDeviceId: string | undefined): Promise<Response> {
  const now = nowIso();
  let deviceId = requestedDeviceId;
  if (!deviceId) {
    const latest = await env.DB.prepare(
      `SELECT id FROM devices WHERE user_id = ?1 ORDER BY last_seen_at DESC LIMIT 1`,
    ).bind(userId).first<{ id: string }>();
    deviceId = latest?.id ?? crypto.randomUUID();
  }

  const owned = await env.DB.prepare(
    `SELECT user_id FROM devices WHERE id = ?1`,
  ).bind(deviceId).first<{ user_id: string }>();
  if (owned && owned.user_id !== userId) return json({ error: "device_exists" }, 409);

  const session = await newSessionMaterial();
  const statements = [];
  if (!owned) {
    statements.push(env.DB.prepare(
      `INSERT INTO devices (id, user_id, created_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?3)`,
    ).bind(deviceId, userId, now));
  } else {
    statements.push(env.DB.prepare(
      `UPDATE devices SET last_seen_at = ?1 WHERE id = ?2`,
    ).bind(now, deviceId));
  }
  statements.push(env.DB.prepare(
    `UPDATE users SET updated_at = ?1 WHERE id = ?2`,
  ).bind(now, userId));
  statements.push(env.DB.prepare(
    `INSERT INTO device_sessions (token_hash, device_id, user_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).bind(session.tokenHash, deviceId, userId, now, session.expiresAt));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (isConflict(error)) return json({ error: "device_exists" }, 409);
    logError("google_session_failed", error);
    return json({ error: "internal" }, 500);
  }

  return sessionResponse(env, {
    deviceId,
    userId,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  }, 200);
}

/**
 * First Google sign-in for a subject creates the same free + trial rows as an
 * anonymous device. A later sign-in with the same subject mints a new bearer
 * session for that user and does not start another trial. The raw ID token is
 * not stored. Omit deviceId to reuse the user's latest device so analyze limits
 * stay on that device.
 */
export async function createOrLinkGoogleSession(
  env: Env,
  subject: string,
  requestedDeviceId: string | undefined,
): Promise<Response> {
  if (!/^[\x21-\x7e]{1,255}$/.test(subject)) return json({ error: "invalid_id_token", provider: "google" }, 401);
  const normalized = normalizeDeviceId(requestedDeviceId);
  if (!normalized.ok) return normalized.response;

  const existing = await findGoogleUser(env, subject);
  if (existing) return linkGoogleSession(env, existing, normalized.deviceId);

  const deviceId = normalized.deviceId ?? crypto.randomUUID();
  if (normalized.deviceId) {
    const taken = await env.DB.prepare(
      `SELECT user_id FROM devices WHERE id = ?1`,
    ).bind(deviceId).first<{ user_id: string }>();
    if (taken) return json({ error: "device_exists" }, 409);
  }

  const userId = crypto.randomUUID();
  const now = nowIso();
  const session = await newSessionMaterial();
  try {
    await env.DB.batch(newAccountStatements(env, {
      userId,
      authProvider: "google",
      providerSubject: subject,
      deviceId,
      now,
      session,
    }));
  } catch (error) {
    if (conflictKind(error) === "user") {
      const raced = await findGoogleUser(env, subject);
      if (raced) return linkGoogleSession(env, raced, normalized.deviceId);
    }
    if (isConflict(error)) return json({ error: "device_exists" }, 409);
    logError("google_session_failed", error);
    return json({ error: "internal" }, 500);
  }

  return sessionResponse(env, {
    deviceId,
    userId,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  }, 201);
}

import { asRecord, json, readJson } from "../http";
import { presentSecret } from "../crypto";
import { verifyGoogleIdToken } from "./google-token";
import { createOrLinkGoogleSession } from "./session";

const APPLE_TODO =
  "Sign in with Apple needs an App Store Services ID, a key, and identity-token verification. " +
  "Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY with wrangler secret put. " +
  "Do not commit the private key. This stub does not call Apple.";

const GOOGLE_TODO =
  "Google sign-in verifies an ID token when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. " +
  "GOOGLE_CLIENT_SECRET is reserved for a future authorization-code exchange and is not used to verify tokens. " +
  "Verification uses GOOGLE_CLIENT_ID as the token audience. " +
  "Set both with wrangler secret put. Do not commit them.";

const APPLE_NAMES = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] as const;
const GOOGLE_NAMES = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;

function filled(value: string | undefined): boolean {
  return presentSecret(value) !== undefined;
}

export function providerStatus(env: Env): { anonymous: true; apple: boolean; google: boolean } {
  return {
    anonymous: true,
    apple: APPLE_NAMES.every((name) => filled(env[name])),
    google: GOOGLE_NAMES.every((name) => filled(env[name])),
  };
}

export async function handleProviders(env: Env): Promise<Response> {
  const status = providerStatus(env);
  return json({
    ...status,
    todo: "Anonymous device ids cover the free tier. Apple stays a stub until its secrets and identity-token verification exist. Google verifies ID tokens once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both set.",
  });
}

async function placeholderSignIn(
  request: Request,
  missing: string[],
  provider: "apple",
  todo: string,
): Promise<Response> {
  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return body.response;
  if (asRecord(body.value) === null) return json({ error: "invalid_json" }, 400);
  // Identity tokens are intentionally ignored. Do not log or store them.
  if (missing.length > 0) {
    return json({ error: "not_configured", provider, missing, todo }, 501);
  }
  return json({ error: "not_implemented", provider, todo }, 501);
}

export async function handleAppleSignIn(request: Request, env: Env): Promise<Response> {
  const missing = APPLE_NAMES.filter((name) => !filled(env[name]));
  return placeholderSignIn(request, missing, "apple", APPLE_TODO);
}

function googleError(error: string, status: number): Response {
  return json({ error, provider: "google" }, status);
}

/**
 * POST /v1/auth/google. Accepts `{ id_token }` or GIS `{ credential }`.
 * Does not log or store the token. CORS and analyze limits stay on the shared
 * session path; this handler does not add a separate limiter.
 */
export async function handleGoogleSignIn(
  request: Request,
  env: Env,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const missing = GOOGLE_NAMES.filter((name) => !filled(env[name]));
  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return body.response;
  const record = asRecord(body.value);
  if (!record) return json({ error: "invalid_json" }, 400);
  if (missing.length > 0) {
    return json({ error: "not_configured", provider: "google", missing, todo: GOOGLE_TODO }, 501);
  }

  const token = readGoogleIdToken(record);
  if (!token.ok) return token.response;
  const clientId = presentSecret(env.GOOGLE_CLIENT_ID);
  if (!clientId) return json({ error: "not_configured", provider: "google", missing: ["GOOGLE_CLIENT_ID"], todo: GOOGLE_TODO }, 501);

  const verified = await verifyGoogleIdToken(token.value, clientId, { fetcher });
  if (!verified.ok) {
    if (verified.reason === "expired") return googleError("expired_id_token", 401);
    if (verified.reason === "email_not_verified") return googleError("email_not_verified", 401);
    if (verified.reason === "certs_unavailable") return googleError("google_certs_unavailable", 503);
    return googleError("invalid_id_token", 401);
  }

  const requestedDevice = record.deviceId;
  if (requestedDevice !== undefined && typeof requestedDevice !== "string") {
    return json({ error: "invalid_device_id" }, 400);
  }
  return createOrLinkGoogleSession(env, verified.sub, requestedDevice);
}

function readGoogleIdToken(
  record: Record<string, unknown>,
): { ok: true; value: string } | { ok: false; response: Response } {
  const idToken = record.id_token;
  const credential = record.credential;
  if (idToken !== undefined && typeof idToken !== "string") return { ok: false, response: googleError("invalid_id_token", 400) };
  if (credential !== undefined && typeof credential !== "string") return { ok: false, response: googleError("invalid_id_token", 400) };
  const idText = typeof idToken === "string" ? idToken.trim() : "";
  const credentialText = typeof credential === "string" ? credential.trim() : "";
  if (idText && credentialText && idText !== credentialText) {
    return { ok: false, response: googleError("invalid_id_token", 400) };
  }
  const token = idText || credentialText;
  if (!token) return { ok: false, response: googleError("missing_id_token", 400) };
  return { ok: true, value: token };
}

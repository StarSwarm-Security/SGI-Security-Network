import { asRecord, json, readJson } from "../http";
import { presentSecret } from "../crypto";

const APPLE_TODO =
  "Sign in with Apple needs an App Store Services ID, a key, and identity-token verification. " +
  "Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY with wrangler secret put. " +
  "Do not commit the private key. This stub does not call Apple.";

const GOOGLE_TODO =
  "Google sign-in needs an OAuth client and ID-token verification. " +
  "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET with wrangler secret put. " +
  "Do not commit the client secret. This stub does not call Google.";

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
    todo: "Apple and Google stay unwired until the store clients exist. Anonymous device ids cover the free tier.",
  });
}

async function placeholderSignIn(
  request: Request,
  missing: string[],
  provider: "apple" | "google",
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

export async function handleGoogleSignIn(request: Request, env: Env): Promise<Response> {
  const missing = GOOGLE_NAMES.filter((name) => !filled(env[name]));
  return placeholderSignIn(request, missing, "google", GOOGLE_TODO);
}

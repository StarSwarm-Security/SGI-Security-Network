import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GOOGLE_JWKS_URL, resetGoogleCertCache, verifyGoogleIdToken } from "../src/auth/google-token";
import { handleAppleSignIn, handleGoogleSignIn, providerStatus } from "../src/auth/providers";
import { ANALYZE_PER_DAY } from "../src/catalog";
import { TEST_GOOGLE_CLIENT_ID, TEST_GOOGLE_CLIENT_SECRET } from "./fixture";

interface SessionBody {
  deviceId: string;
  userId: string;
  sessionToken: string;
  tokenType: string;
  expiresAt: string;
  entitlement: { tier: string; productId: string | null };
}

const PAGES = "https://starswarm-sgi.pages.dev";

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in pair) || !("publicKey" in pair)) throw new Error("expected an RSA key pair");
  privateKey = pair.privateKey;
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  if (exported instanceof ArrayBuffer) throw new Error("expected a JWK");
  publicJwk = exported;
});

beforeEach(() => {
  resetGoogleCertCache();
});

function googleEnv(): Env {
  return {
    ...env,
    GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: TEST_GOOGLE_CLIENT_SECRET,
  };
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signToken(
  claims: Record<string, unknown>,
  kid = "test-kid",
  headerExtra: Record<string, unknown> = {},
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid, ...headerExtra };
  const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://accounts.google.com",
    aud: TEST_GOOGLE_CLIENT_ID,
    azp: TEST_GOOGLE_CLIENT_ID,
    sub: `google-sub-${crypto.randomUUID()}`,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

function jwksFetcher(kid: string, calls: string[], status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(init?.body ? `${url} body` : url);
    if (url !== GOOGLE_JWKS_URL || status !== 200) {
      return new Response("no certs", { status: status === 200 ? 404 : status });
    }
    return new Response(JSON.stringify({
      keys: [{
        kty: publicJwk.kty,
        n: publicJwk.n,
        e: publicJwk.e,
        kid,
        alg: "RS256",
        use: "sig",
      }],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }) as typeof fetch;
}

function googleRequest(body: unknown): Request {
  return new Request("https://sgi-api.test/v1/auth/google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: PAGES,
    },
    body: JSON.stringify(body),
  });
}

describe("Google ID token sign-in", () => {
  it("rejects missing secrets without calling Google", async () => {
    const calls: string[] = [];
    const token = await signToken(claims());
    const response = await handleGoogleSignIn(
      googleRequest({ id_token: token }),
      { ...env, GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: "   " },
      jwksFetcher("test-kid", calls),
    );
    expect(response.status).toBe(501);
    const body = await response.json() as { error: string; missing: string[] };
    expect(body.error).toBe("not_configured");
    expect(body.missing).toEqual(["GOOGLE_CLIENT_SECRET"]);
    expect(JSON.stringify(body)).not.toContain(token);
    expect(calls).toEqual([]);
    expect(providerStatus(googleEnv()).google).toBe(true);
    expect(providerStatus({ ...env, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: TEST_GOOGLE_CLIENT_SECRET }).google).toBe(false);
  });

  it("creates a session for a verified subject and reuses it", async () => {
    const calls: string[] = [];
    const sub = `google-sub-${crypto.randomUUID()}`;
    const email = "person@example.com";
    const token = await signToken(claims({
      sub,
      email,
      email_verified: true,
      iss: "accounts.google.com",
    }));
    const fetcher = jwksFetcher("test-kid", calls);
    const created = await handleGoogleSignIn(googleRequest({ credential: token }), googleEnv(), fetcher);
    expect(created.status).toBe(201);
    const first = await created.json() as SessionBody;
    expect(first.tokenType).toBe("bearer");
    expect(first.sessionToken.startsWith("sgi_")).toBe(true);
    expect(first.entitlement.tier).toBe("trial");
    expect(JSON.stringify(first)).not.toContain(token);
    expect(JSON.stringify(first)).not.toContain(email);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(GOOGLE_JWKS_URL);
    expect(calls[0]).not.toContain(token);
    expect(calls[0]).not.toContain(TEST_GOOGLE_CLIENT_SECRET);

    const stored = await env.DB.prepare(
      `SELECT auth_provider, provider_subject FROM users WHERE id = ?1`,
    ).bind(first.userId).first<{ auth_provider: string; provider_subject: string }>();
    expect(stored).toEqual({ auth_provider: "google", provider_subject: sub });
    const sessions = await env.DB.prepare(
      `SELECT token_hash, device_id, user_id FROM device_sessions WHERE user_id = ?1`,
    ).bind(first.userId).all<{ token_hash: string; device_id: string; user_id: string }>();
    expect(JSON.stringify(sessions.results)).not.toContain(token);
    expect(sessions.results.some((row) => row.token_hash === first.sessionToken)).toBe(false);

    const againToken = await signToken(claims({ sub, email, email_verified: "true" }));
    const again = await handleGoogleSignIn(googleRequest({ id_token: againToken }), googleEnv(), fetcher);
    expect(again.status).toBe(200);
    const second = await again.json() as SessionBody;
    expect(second.userId).toBe(first.userId);
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.sessionToken).not.toBe(first.sessionToken);
    expect(calls).toHaveLength(1);

    const entitlements = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entitlements WHERE user_id = ?1`,
    ).bind(first.userId).first<{ n: number }>();
    expect(entitlements?.n).toBe(2);

    const me = await env.DB.prepare(
      `SELECT token_hash FROM device_sessions WHERE user_id = ?1 AND device_id = ?2`,
    ).bind(first.userId, first.deviceId).all();
    expect(me.results).toHaveLength(2);

    await env.DB.prepare(
      `UPDATE entitlements SET expires_at = ?1 WHERE user_id = ?2 AND tier = 'trial'`,
    ).bind("2000-01-01T00:00:00.000Z", first.userId).run();
    const expiredTrial = await handleGoogleSignIn(
      googleRequest({ id_token: await signToken(claims({ sub })) }),
      googleEnv(),
      fetcher,
    );
    expect(expiredTrial.status).toBe(200);
    const fallen = await expiredTrial.json() as SessionBody;
    expect(fallen.userId).toBe(first.userId);
    expect(fallen.entitlement.tier).toBe("free");
    expect(JSON.stringify(fallen)).not.toContain(email);
  });

  it("keeps analyze limits on the Google device session", async () => {
    const token = await signToken(claims());
    const created = await handleGoogleSignIn(googleRequest({ id_token: token }), googleEnv(), jwksFetcher("test-kid", []));
    expect(created.status).toBe(201);
    const session = await created.json() as SessionBody;
    const analyzed = await SELF.fetch(new Request("https://sgi-api.test/v1/analyze", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.sessionToken}`,
        "Content-Type": "application/json",
        Origin: PAGES,
      },
      body: JSON.stringify({ text: "interface Gi0/1", mode: "config", deviceType: "router" }),
    }));
    expect(analyzed.status).toBe(200);
    expect(analyzed.headers.get("X-RateLimit-Limit")).toBe(String(ANALYZE_PER_DAY.trial));
    expect(analyzed.headers.get("Access-Control-Allow-Origin")).toBe(PAGES);
  });

  it("does not take over another user's device", async () => {
    const anon = await SELF.fetch(new Request("https://sgi-api.test/v1/auth/device", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: PAGES },
      body: "{}",
    }));
    expect(anon.status).toBe(201);
    const device = await anon.json() as { deviceId: string };
    const sub = `google-sub-${crypto.randomUUID()}`;
    const token = await signToken(claims({ sub }));
    const response = await handleGoogleSignIn(
      googleRequest({ id_token: token, deviceId: device.deviceId }),
      googleEnv(),
      jwksFetcher("test-kid", []),
    );
    expect(response.status).toBe(409);
    const row = await env.DB.prepare(
      `SELECT id FROM users WHERE provider_subject = ?1`,
    ).bind(sub).first();
    expect(row).toBeNull();
  });

  it("returns 401 for a bad, mismatched, or expired token and never 501", async () => {
    const calls: string[] = [];
    const fetcher = jwksFetcher("test-kid", calls);
    const now = Math.floor(Date.now() / 1000);
    const cases: Array<{ token: string; status: number; error: string; fetches: boolean }> = [
      { token: "not-a-jwt", status: 401, error: "invalid_id_token", fetches: false },
      {
        token: await signToken(claims(), "test-kid", { alg: "none" }),
        status: 401,
        error: "invalid_id_token",
        fetches: false,
      },
      {
        token: await (async () => {
          const signed = await signToken(claims());
          const [header, payload, signature] = signed.split(".");
          const flipped = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
          return `${header}.${payload}.${flipped}`;
        })(),
        status: 401,
        error: "invalid_id_token",
        fetches: true,
      },
      {
        token: await signToken(claims({ aud: "other-client.apps.googleusercontent.com", azp: "other-client.apps.googleusercontent.com" })),
        status: 401,
        error: "invalid_id_token",
        fetches: true,
      },
      {
        token: await signToken(claims({ iss: "https://accounts.google.com.evil" })),
        status: 401,
        error: "invalid_id_token",
        fetches: true,
      },
      {
        token: await signToken(claims({ iat: now - 3600, exp: now - 120 })),
        status: 401,
        error: "expired_id_token",
        fetches: true,
      },
      {
        token: await signToken(claims({ email: "person@example.com", email_verified: false })),
        status: 401,
        error: "email_not_verified",
        fetches: true,
      },
    ];
    for (const item of cases) {
      calls.length = 0;
      resetGoogleCertCache();
      const response = await handleGoogleSignIn(googleRequest({ id_token: item.token }), googleEnv(), fetcher);
      expect(response.status).toBe(item.status);
      const body = await response.json() as { error: string };
      expect(body.error).toBe(item.error);
      expect(body.error).not.toBe("not_implemented");
      expect(JSON.stringify(body)).not.toContain(item.token);
      expect(calls.length > 0).toBe(item.fetches);
    }

    const skewed = await verifyGoogleIdToken(
      await signToken(claims({ exp: now - 30, iat: now - 60 })),
      TEST_GOOGLE_CLIENT_ID,
      { fetcher },
    );
    expect(skewed.ok).toBe(true);
    const arrayAud = await verifyGoogleIdToken(
      await signToken(claims({ aud: [TEST_GOOGLE_CLIENT_ID, "other-client"], azp: TEST_GOOGLE_CLIENT_ID })),
      TEST_GOOGLE_CLIENT_ID,
      { fetcher },
    );
    expect(arrayAud.ok).toBe(true);
    const badAzp = await verifyGoogleIdToken(
      await signToken(claims({ azp: "other-client" })),
      TEST_GOOGLE_CLIENT_ID,
      { fetcher },
    );
    expect(badAzp).toEqual({ ok: false, reason: "invalid" });

    const missing = await handleGoogleSignIn(googleRequest({}), googleEnv(), fetcher);
    expect(missing.status).toBe(400);
    expect((await missing.json() as { error: string }).error).toBe("missing_id_token");

    const conflict = await handleGoogleSignIn(
      googleRequest({ id_token: "aaa.bbb.ccc", credential: "ddd.eee.fff" }),
      googleEnv(),
      fetcher,
    );
    expect(conflict.status).toBe(400);

    resetGoogleCertCache();
    const unavailable = await handleGoogleSignIn(
      googleRequest({ id_token: await signToken(claims()) }),
      googleEnv(),
      jwksFetcher("test-kid", [], 500),
    );
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json() as { error: string }).error).toBe("google_certs_unavailable");

    resetGoogleCertCache();
    const unknownKid = await handleGoogleSignIn(
      googleRequest({ id_token: await signToken(claims(), "other-kid") }),
      googleEnv(),
      fetcher,
    );
    expect(unknownKid.status).toBe(401);
    expect((await unknownKid.json() as { error: string }).error).toBe("invalid_id_token");
  });

  it("leaves Apple unimplemented when its secrets exist", async () => {
    const ready = await handleAppleSignIn(
      new Request("https://sgi-api.test/v1/auth/apple", {
        method: "POST",
        body: JSON.stringify({ identityToken: "still-ignored" }),
      }),
      {
        ...env,
        APPLE_CLIENT_ID: "placeholder.client",
        APPLE_TEAM_ID: "TEAM",
        APPLE_KEY_ID: "KEY",
        APPLE_PRIVATE_KEY: "not-a-real-key",
      },
    );
    expect(ready.status).toBe(501);
    expect((await ready.json() as { error: string }).error).toBe("not_implemented");
  });
});

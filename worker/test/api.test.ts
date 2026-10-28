import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleAppleSignIn } from "../src/auth/providers";
import { hmacSha256Hex } from "../src/crypto";
import { handleRevenueCat } from "../src/webhooks/revenuecat";
import { ANALYZE_PER_DAY, MONTHLY_PRODUCT_ID, PRODUCTS, TRIAL_DAYS, TRIAL_PRODUCT_ID, YEARLY_PRODUCT_ID } from "../src/catalog";
import { utcDay } from "../src/time";
import { TEST_WEBHOOK_SECRET } from "./fixture";

interface DeviceAuth {
  deviceId: string;
  userId: string;
  sessionToken: string;
  entitlement: { tier: string };
}

const PAGES = "https://starswarm-sgi.pages.dev";
const WORKERS = "https://sgi.starswarm.workers.dev";

async function api(path: string, init: RequestInit = {}, token?: string, origin = PAGES): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return SELF.fetch(new Request(`https://sgi-api.test${path}`, { ...init, headers }));
}

async function signup(): Promise<DeviceAuth> {
  const response = await api("/v1/auth/device", { method: "POST", body: "{}" });
  expect(response.status).toBe(201);
  return response.json() as Promise<DeviceAuth>;
}

async function columns(table: string): Promise<string[]> {
  const result = await env.DB.prepare(`SELECT name FROM pragma_table_info(?)`).bind(table).all<{ name: string }>();
  if (result.results.length === 0) {
    const fallback = await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>();
    return fallback.results.map((row) => row.name);
  }
  return result.results.map((row) => row.name);
}

describe("sgi-api skeleton", () => {
  it("keeps personal data columns out of the schema", async () => {
    const tables = [
      "users",
      "devices",
      "device_sessions",
      "entitlements",
      "revenuecat_events",
      "analyze_cache",
      "analyze_usage",
      "swarm_pass_snapshots",
      "redeem_codes",
      "redeem_redemptions",
    ];
    const banned = ["email", "ip", "ip_address", "wallet", "password", "secret", "payload", "raw_paste", "card_number"];
    for (const table of tables) {
      const names = await columns(table);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(banned).not.toContain(name);
    }
    expect(await columns("device_sessions")).toContain("token_hash");
    expect(await columns("device_sessions")).not.toContain("token");
    expect(await columns("analyze_cache")).not.toContain("text");
  });

  it("mints an anonymous free-tier device and rejects a repeated device id", async () => {
    const first = await signup();
    expect(first.entitlement.tier).toBe("trial");
    expect(first.sessionToken.startsWith("sgi_")).toBe(true);
    const stored = await env.DB.prepare(`SELECT token_hash FROM device_sessions WHERE device_id = ?`).bind(first.deviceId).all<{ token_hash: string }>();
    expect(stored.results.some((row) => row.token_hash === first.sessionToken)).toBe(false);

    const again = await api("/v1/auth/device", {
      method: "POST",
      body: JSON.stringify({ deviceId: first.deviceId }),
    });
    expect(again.status).toBe(409);

    const me = await api("/v1/me", {}, first.sessionToken);
    expect(me.status).toBe(200);
    const body = await me.json() as { userId: string; entitlement: { tier: string } };
    expect(body.userId).toBe(first.userId);
    expect(body.entitlement.tier).toBe("trial");
  });

  it("starts a 3-day Pro trial and falls back to the permanent free tier", async () => {
    const created = await signup();
    const opened = await api("/v1/entitlements", {}, created.sessionToken);
    const active = await opened.json() as {
      entitlement: { tier: string; priceCents: number; analyzePerDay: number; expiresAt: string; productId: string };
      products: Array<{ productId: string; priceCents: number; label: string; trialDays: number | null }>;
    };
    expect(active.entitlement).toMatchObject({
      tier: "trial",
      priceCents: 0,
      productId: TRIAL_PRODUCT_ID,
      analyzePerDay: ANALYZE_PER_DAY.monthly,
    });
    expect(ANALYZE_PER_DAY.trial).toBe(ANALYZE_PER_DAY.monthly);
    const trialEnd = Date.parse(active.entitlement.expiresAt);
    const threeDays = TRIAL_DAYS * 24 * 60 * 60 * 1000;
    expect(trialEnd).toBeGreaterThan(Date.now() + threeDays - 60_000);
    expect(trialEnd).toBeLessThan(Date.now() + threeDays + 60_000);

    const freeRow = await env.DB.prepare(
      `SELECT expires_at FROM entitlements WHERE user_id = ?1 AND tier = 'free' AND source = 'default'`,
    ).bind(created.userId).first<{ expires_at: string | null }>();
    expect(freeRow?.expires_at).toBeNull();

    await env.DB.prepare(
      `UPDATE entitlements SET expires_at = ?1 WHERE user_id = ?2 AND tier = 'trial'`,
    ).bind("2000-01-01T00:00:00.000Z", created.userId).run();
    const after = await api("/v1/entitlements", {}, created.sessionToken);
    const fallenBack = await after.json() as { entitlement: { tier: string; analyzePerDay: number; priceCents: number } };
    expect(fallenBack.entitlement).toMatchObject({
      tier: "free",
      priceCents: 0,
      analyzePerDay: ANALYZE_PER_DAY.free,
    });

    const catalog = await api("/v1/catalog");
    const listed = await catalog.json() as { products: typeof PRODUCTS };
    expect(listed.products).toEqual([...PRODUCTS]);
    expect(listed.products.map((product) => product.productId)).toEqual([
      TRIAL_PRODUCT_ID,
      MONTHLY_PRODUCT_ID,
      YEARLY_PRODUCT_ID,
    ]);
    expect(listed.products.find((product) => product.tier === "monthly")?.priceCents).toBe(999);
    expect(listed.products.find((product) => product.tier === "yearly")?.priceCents).toBe(3999);
    expect(listed.products.find((product) => product.tier === "trial")?.trialDays).toBe(3);
  });

  it("leaves Apple and Google unwired", async () => {
    const providers = await api("/v1/auth/providers");
    expect(providers.status).toBe(200);
    const listed = await providers.json() as { anonymous: boolean; apple: boolean; google: boolean };
    expect(listed).toMatchObject({ anonymous: true, apple: false, google: false });

    const apple = await api("/v1/auth/apple", { method: "POST", body: JSON.stringify({ identityToken: "ignore-me" }) });
    expect(apple.status).toBe(501);
    const appleBody = await apple.json() as { error: string; missing: string[] };
    expect(appleBody.error).toBe("not_configured");
    expect(appleBody.missing).toContain("APPLE_PRIVATE_KEY");
    expect(JSON.stringify(appleBody)).not.toContain("ignore-me");

    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return original(input);
    }) as typeof fetch;
    try {
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
      const readyBody = await ready.json() as { error: string };
      expect(readyBody.error).toBe("not_implemented");
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("allows the Pages and workers.dev origins and rejects others", async () => {
    for (const origin of [PAGES, WORKERS]) {
      const response = await api("/v1/health", {}, undefined, origin);
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      const health = await response.json() as { llmEnabled: boolean; phase: string };
      expect(health.phase).toBe("skeleton");
      expect(health.llmEnabled).toBe(false);
    }
    const preflight = await api("/v1/analyze", { method: "OPTIONS" }, undefined, PAGES);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(PAGES);

    const blocked = await api("/v1/health", {}, undefined, "https://evil.example");
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const denied = await api("/v1/analyze", { method: "OPTIONS" }, undefined, "https://evil.example");
    expect(denied.status).toBe(403);
  });

  it("mirrors the offline analyzers, caches by hash, and rate limits", async () => {
    const { sessionToken, deviceId, userId } = await signup();
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return original(input);
    }) as typeof fetch;
    try {
      const paste = await api("/v1/analyze", {
        method: "POST",
        body: JSON.stringify({ text: "Press Win+R and stop", mode: "paste" }),
      }, sessionToken);
      expect(paste.status).toBe(200);
      const pasteBody = await paste.json() as {
        cached: boolean;
        llm: { enabled: boolean; called: boolean };
        result: { verdict: string };
      };
      expect(pasteBody.cached).toBe(false);
      expect(pasteBody.result.verdict).toBe("dangerous");
      expect(pasteBody.llm).toEqual({ enabled: false, called: false });
      expect(calls).toEqual([]);

      const again = await api("/v1/analyze", {
        method: "POST",
        body: JSON.stringify({ text: "Press Win+R and stop", mode: "paste" }),
      }, sessionToken);
      const againBody = await again.json() as { cached: boolean };
      expect(againBody.cached).toBe(true);

      const config = await api("/v1/analyze", {
        method: "POST",
        body: JSON.stringify({ text: "interface Gi0/1", mode: "config", deviceType: "router" }),
      }, sessionToken);
      expect(config.status).toBe(200);
      const configBody = await config.json() as { result: { reports: unknown[] } };
      expect(configBody.result.reports).toHaveLength(6);
    } finally {
      globalThis.fetch = original;
    }

    const limit = ANALYZE_PER_DAY.trial;
    await env.DB.prepare(
      `INSERT INTO analyze_usage (device_id, user_id, window_start, request_count)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (device_id, window_start) DO UPDATE SET request_count = ?4`,
    ).bind(deviceId, userId, utcDay(), limit).run();
    const limited = await api("/v1/analyze", {
      method: "POST",
      body: JSON.stringify({ text: "show version", mode: "config" }),
    }, sessionToken);
    expect(limited.status).toBe(429);

    const anon = await api("/v1/analyze", { method: "POST", body: JSON.stringify({ text: "show version" }) });
    expect(anon.status).toBe(401);
  });

  it("syncs Swarm Pass without replacing bonus credits", async () => {
    const { sessionToken } = await signup();
    const put = await api("/v1/swarm-pass", {
      method: "PUT",
      body: JSON.stringify({
        credits: 40,
        badges: ["scout", "tour"],
        days: ["2026-10-27"],
        tourDone: true,
        lastCheckIn: "2026-10-27",
      }),
    }, sessionToken);
    expect(put.status).toBe(200);
    const body = await put.json() as { authoritative: boolean; clientCredits: number; credits: number };
    expect(body.authoritative).toBe(false);
    expect(body.clientCredits).toBe(40);
    expect(body.credits).toBe(40);
  });

  it("enforces one-time redeem codes", async () => {
    const first = await signup();
    const second = await signup();
    await env.DB.prepare(
      `INSERT INTO redeem_codes (code, kind, sc_amount, tier, tier_days, max_uses, use_count, expires_at, created_at, note)
       VALUES ('ONCE-SC', 'sc_grant', 25, NULL, NULL, 1, 0, NULL, ?1, 'test')`,
    ).bind(new Date().toISOString()).run();

    const ok = await api("/v1/redeem/codes", { method: "POST", body: JSON.stringify({ code: "once-sc" }) }, first.sessionToken);
    expect(ok.status).toBe(200);
    const granted = await ok.json() as { alreadyRedeemed: boolean; bonusCredits: number };
    expect(granted.alreadyRedeemed).toBe(false);
    expect(granted.bonusCredits).toBe(25);

    const replay = await api("/v1/redeem/codes", { method: "POST", body: JSON.stringify({ code: "ONCE-SC" }) }, first.sessionToken);
    expect(replay.status).toBe(200);
    const replayBody = await replay.json() as { alreadyRedeemed: boolean; bonusCredits: number };
    expect(replayBody.alreadyRedeemed).toBe(true);
    expect(replayBody.bonusCredits).toBe(25);

    const other = await api("/v1/redeem/codes", { method: "POST", body: JSON.stringify({ code: "ONCE-SC" }) }, second.sessionToken);
    expect(other.status).toBe(409);

    const pass = await api("/v1/swarm-pass", {
      method: "PUT",
      body: JSON.stringify({ credits: 45, badges: ["scout"], days: ["2026-10-27"], tourDone: false, lastCheckIn: null }),
    }, first.sessionToken);
    const passBody = await pass.json() as { clientCredits: number; bonusCredits: number; credits: number };
    expect(passBody.clientCredits).toBe(45);
    expect(passBody.bonusCredits).toBe(25);
    expect(passBody.credits).toBe(70);

    const gift = await api("/v1/redeem/gift-card", {
      method: "POST",
      body: JSON.stringify({ asset: "btc", address: "bc1q-do-not-store" }),
    }, first.sessionToken);
    expect(gift.status).toBe(501);
    expect(await gift.text()).not.toContain("bc1q");
  });

  it("grants a one-time tier trial", async () => {
    const { sessionToken, userId } = await signup();
    await env.DB.prepare(
      `INSERT INTO redeem_codes (code, kind, sc_amount, tier, tier_days, max_uses, use_count, expires_at, created_at, note)
       VALUES ('YEAR-TRIAL', 'tier_trial', NULL, 'yearly', 3, 1, 0, NULL, ?1, 'test')`,
    ).bind(new Date().toISOString()).run();
    const response = await api("/v1/redeem/codes", { method: "POST", body: JSON.stringify({ code: "YEAR-TRIAL" }) }, sessionToken);
    expect(response.status).toBe(200);
    const ent = await api("/v1/entitlements", {}, sessionToken);
    const body = await ent.json() as { entitlement: { tier: string; source: string } };
    expect(body.entitlement.tier).toBe("yearly");
    expect(body.entitlement.source).toBe("promo");
    const rows = await env.DB.prepare(`SELECT id FROM entitlements WHERE user_id = ? AND source = 'promo'`).bind(userId).all();
    expect(rows.results).toHaveLength(1);
    const second = await api("/v1/redeem/codes", { method: "POST", body: JSON.stringify({ code: "YEAR-TRIAL" }) }, sessionToken);
    expect((await second.json() as { alreadyRedeemed: boolean }).alreadyRedeemed).toBe(true);
    const rowsAfter = await env.DB.prepare(`SELECT id FROM entitlements WHERE user_id = ? AND source = 'promo'`).bind(userId).all();
    expect(rowsAfter.results).toHaveLength(1);
  });

  it("verifies RevenueCat signatures and updates entitlements", async () => {
    const unset = await handleRevenueCat(
      new Request("https://sgi-api.test/v1/webhooks/revenuecat", { method: "POST", body: "{}" }),
      { ...env, REVENUECAT_WEBHOOK_SECRET: "" },
    );
    expect(unset.status).toBe(503);

    const { userId, sessionToken } = await signup();
    const event = {
      event: {
        id: "evt_yearly_1",
        type: "INITIAL_PURCHASE",
        app_user_id: userId,
        product_id: YEARLY_PRODUCT_ID,
        expiration_at_ms: Date.now() + 86_400_000,
        email: "person@example.com",
      },
    };
    const raw = JSON.stringify(event);
    const signature = await hmacSha256Hex(TEST_WEBHOOK_SECRET, new TextEncoder().encode(raw));
    const bad = await api("/v1/webhooks/revenuecat", {
      method: "POST",
      body: raw,
      headers: { "X-RevenueCat-Signature": "00" },
    });
    expect(bad.status).toBe(401);

    const good = await api("/v1/webhooks/revenuecat", {
      method: "POST",
      body: raw,
      headers: { "X-RevenueCat-Signature": signature },
    });
    expect(good.status).toBe(200);
    const goodBody = await good.json() as { applied: boolean; reason: string };
    expect(goodBody.applied).toBe(true);
    expect(goodBody.reason).toBe("granted");
    expect(JSON.stringify(goodBody)).not.toContain("person@example.com");

    const ent = await api("/v1/entitlements", {}, sessionToken);
    expect((await ent.json() as { entitlement: { tier: string; priceCents: number } }).entitlement).toMatchObject({
      tier: "yearly",
      priceCents: 3999,
    });

    const duplicate = await api("/v1/webhooks/revenuecat", {
      method: "POST",
      body: raw,
      headers: { Authorization: `Bearer ${TEST_WEBHOOK_SECRET}` },
    });
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json() as { duplicate: boolean }).duplicate).toBe(true);

    const emailEvent = {
      event: {
        id: "evt_email_1",
        type: "INITIAL_PURCHASE",
        app_user_id: "person@example.com",
        product_id: MONTHLY_PRODUCT_ID,
        expiration_at_ms: Date.now() + 86_400_000,
      },
    };
    const emailRaw = JSON.stringify(emailEvent);
    const emailSig = await hmacSha256Hex(TEST_WEBHOOK_SECRET, new TextEncoder().encode(emailRaw));
    const rejected = await api("/v1/webhooks/revenuecat", {
      method: "POST",
      body: emailRaw,
      headers: { "X-RevenueCat-Signature": emailSig },
    });
    expect(rejected.status).toBe(200);
    const rejectedBody = await rejected.json() as { applied: boolean };
    expect(rejectedBody.applied).toBe(false);
    expect(JSON.stringify(rejectedBody)).not.toContain("person@example.com");
    const stored = await env.DB.prepare(`SELECT app_user_id FROM revenuecat_events WHERE id = 'evt_email_1'`).first<{ app_user_id: string | null }>();
    expect(stored?.app_user_id).toBeNull();
  });

  it("does not run breach or external scanners", async () => {
    for (const path of ["/v1/breach/check", "/v1/scan/external"]) {
      const response = await api(path, {
        method: "POST",
        body: JSON.stringify({ domain: "example.com", url: "https://example.com/admin" }),
      });
      expect(response.status).toBe(501);
      const text = await response.text();
      expect(text).toContain("ownership");
      expect(text).not.toContain("example.com");
    }
    const status = await api("/v1/breach/status");
    expect(status.status).toBe(501);
  });
});

import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleDeviceAuth } from "../src/auth/device";
import { handleGoogleSignIn } from "../src/auth/providers";
import { limitIp, limitKey } from "../src/protect";
import { SITEVERIFY_URL, verifyTurnstile } from "../src/auth/turnstile";

const SECRET = "turnstile-test-secret-value";
const TOKEN = "turnstile-test-token-value";
const HOSTS = "starswarm-sgi.pages.dev,sgi.starswarm.workers.dev";
const PAGES = "https://starswarm-sgi.pages.dev";

function turnstileEnv(enforce: "0" | "1"): Env {
  return {
    ...env,
    TURNSTILE_ENFORCE: enforce as Env["TURNSTILE_ENFORCE"],
    TURNSTILE_SECRET: SECRET,
    TURNSTILE_HOSTNAMES: HOSTS,
  };
}

function deviceRequest(token?: string, ip?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json", Origin: PAGES });
  if (ip) headers.set("CF-Connecting-IP", ip);
  return new Request("https://sgi-api.test/v1/auth/device", {
    method: "POST",
    headers,
    body: JSON.stringify(token ? { turnstileToken: token } : {}),
  });
}

function siteverify(body: unknown, status = 200, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    seen.push(url);
    const sent = JSON.parse(String(init?.body)) as { secret?: string; response?: string };
    expect(sent.secret).toBe(SECRET);
    expect(sent.response).toBe(TOKEN);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function hang(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  })) as typeof fetch;
}

async function captureLogs(run: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(" "));
  };
  try {
    await run();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

describe("Turnstile siteverify", () => {
  it("allows a failed check when enforce is off and rejects it when enforce is on", async () => {
    const seen: string[] = [];
    const fetcher = siteverify({ success: false, "error-codes": ["invalid-input-response"] }, 200, seen);
    const logs = await captureLogs(async () => {
      const open = await verifyTurnstile(turnstileEnv("0"), TOKEN, "device", fetcher);
      expect(open).toMatchObject({ ok: true, enforce: false, reason: "rejected" });
      const closed = await verifyTurnstile(turnstileEnv("1"), TOKEN, "device", fetcher);
      expect(closed).toMatchObject({ ok: false, enforce: true, reason: "rejected" });
    });
    expect(seen).toEqual([SITEVERIFY_URL, SITEVERIFY_URL]);
    expect(logs).not.toContain(SECRET);
    expect(logs).not.toContain(TOKEN);
    expect(logs).toContain("invalid-input-response");
  });

  it("rejects a bad action and a bad hostname only when enforce is on", async () => {
    const badAction = siteverify({ success: true, action: "device", hostname: "starswarm-sgi.pages.dev" });
    const openAction = await verifyTurnstile(turnstileEnv("0"), TOKEN, "google", badAction);
    expect(openAction).toMatchObject({ ok: true, reason: "bad_action" });
    const closedAction = await verifyTurnstile(turnstileEnv("1"), TOKEN, "google", badAction);
    expect(closedAction).toMatchObject({ ok: false, reason: "bad_action" });

    const badHost = siteverify({ success: true, action: "device", hostname: "evil.example" });
    const openHost = await verifyTurnstile(turnstileEnv("0"), TOKEN, "device", badHost);
    expect(openHost).toMatchObject({ ok: true, reason: "bad_hostname" });
    const closedHost = await verifyTurnstile(turnstileEnv("1"), TOKEN, "device", badHost);
    expect(closedHost).toMatchObject({ ok: false, reason: "bad_hostname" });

    const ok = await verifyTurnstile(
      turnstileEnv("1"),
      TOKEN,
      "device",
      siteverify({ success: true, action: "device", hostname: "StarSwarm-SGI.pages.dev" }),
    );
    expect(ok).toMatchObject({ ok: true, reason: "ok" });
  });

  it("accepts the shared gate widget action on both routes when enforce is on", async () => {
    const shared = siteverify({ success: true, action: "gate", hostname: "sgi.starswarm.workers.dev" });
    const device = await verifyTurnstile(turnstileEnv("1"), TOKEN, "device", shared);
    expect(device).toMatchObject({ ok: true, enforce: true, reason: "ok" });
    const google = await verifyTurnstile(turnstileEnv("1"), TOKEN, "google", shared);
    expect(google).toMatchObject({ ok: true, enforce: true, reason: "ok" });
  });

  it("times out the Siteverify fetch and fails closed only when enforce is on", async () => {
    const open = await verifyTurnstile(turnstileEnv("0"), TOKEN, "device", hang(), 20);
    expect(open).toMatchObject({ ok: true, reason: "timeout" });
    const closed = await verifyTurnstile(turnstileEnv("1"), TOKEN, "google", hang(), 20);
    expect(closed).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("returns 403 from device and Google routes when enforce is on", async () => {
    const denied = await handleDeviceAuth(
      deviceRequest(TOKEN),
      turnstileEnv("1"),
      siteverify({ success: true, action: "signup", hostname: "starswarm-sgi.pages.dev" }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "turnstile_failed" });

    const allowed = await handleDeviceAuth(
      deviceRequest(),
      { ...turnstileEnv("0"), TURNSTILE_SECRET: "" },
    );
    expect(allowed.status).toBe(201);

    const google = await handleGoogleSignIn(
      new Request("https://sgi-api.test/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: PAGES },
        body: JSON.stringify({ credential: "ignored-id-token", turnstileToken: TOKEN }),
      }),
      { ...turnstileEnv("1"), GOOGLE_CLIENT_ID: "test-google-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only-not-a-google-secret" },
      siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    );
    expect(google.status).toBe(403);
    const googleBody = await google.json() as { error: string };
    expect(googleBody).toEqual({ error: "turnstile_failed" });
    expect(JSON.stringify(googleBody)).not.toContain(TOKEN);
    expect(JSON.stringify(googleBody)).not.toContain("ignored-id-token");
  });
});

describe("route rate limits", () => {
  it("skips a missing binding and a thrown lookup", async () => {
    const request = new Request("https://sgi-api.test/v1/auth/device", {
      headers: { "CF-Connecting-IP": "192.0.2.9" },
    });
    expect(await limitIp(request, undefined, "device")).toBeNull();
    const broken = {
      limit: () => {
        throw new Error("binding down");
      },
    } as unknown as RateLimit;
    expect(await limitKey(broken, "device:192.0.2.9")).toBeNull();
  });

  async function post(path: string, ip: string, token?: string, body = "{}"): Promise<Response> {
    const headers = new Headers({
      Origin: PAGES,
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
    });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return SELF.fetch(new Request(`https://sgi-api.test${path}`, { method: "POST", headers, body }));
  }

  it("returns 429 after 5 device sign-ins from one address", async () => {
    const ip = "192.0.2.10";
    for (let i = 0; i < 5; i += 1) {
      const ok = await post("/v1/auth/device", ip);
      expect(ok.status).toBe(201);
    }
    const blocked = await post("/v1/auth/device", ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe(PAGES);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
  });

  it("returns 429 after 10 Google sign-in attempts from one address", async () => {
    const ip = "192.0.2.20";
    for (let i = 0; i < 10; i += 1) {
      const open = await post("/v1/auth/google", ip);
      expect(open.status).toBe(501);
    }
    const blocked = await post("/v1/auth/google", ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
  });

  it("limits redeem per address and per session", async () => {
    const shared = "192.0.2.30";
    for (let i = 0; i < 5; i += 1) {
      const denied = await post("/v1/redeem/codes", shared, undefined, JSON.stringify({ code: "NOPE" }));
      expect(denied.status).toBe(401);
    }
    const byIp = await post("/v1/redeem/codes", shared, undefined, JSON.stringify({ code: "NOPE" }));
    expect(byIp.status).toBe(429);
    expect(byIp.headers.get("Retry-After")).toBe("60");

    const created = await post("/v1/auth/device", "192.0.2.31");
    expect(created.status).toBe(201);
    const session = await created.json() as { sessionToken: string };
    for (let i = 0; i < 5; i += 1) {
      const miss = await post("/v1/redeem/codes", `198.51.100.${i + 1}`, session.sessionToken, JSON.stringify({ code: "NOPE" }));
      expect(miss.status).toBe(404);
    }
    const bySession = await post("/v1/redeem/codes", "198.51.100.9", session.sessionToken, JSON.stringify({ code: "NOPE" }));
    expect(bySession.status).toBe(429);
  });

  it("returns 429 for support chat and agent routes", async () => {
    const chatIp = "192.0.2.40";
    for (let i = 0; i < 20; i += 1) {
      const ok = await post("/v1/support/chat", chatIp, undefined, JSON.stringify({ message: "how much is pro" }));
      expect(ok.status).toBe(200);
    }
    const chat = await post("/v1/support/chat", chatIp, undefined, JSON.stringify({ message: "how much is pro" }));
    expect(chat.status).toBe(429);
    expect(chat.headers.get("Retry-After")).toBe("60");

    const agentIp = "192.0.2.50";
    for (let i = 0; i < 20; i += 1) {
      const opened = await SELF.fetch(new Request("https://sgi-api.test/agents/not-a-route", {
        headers: { Origin: PAGES, "CF-Connecting-IP": agentIp },
      }));
      expect(opened.status).not.toBe(429);
    }
    const agents = await SELF.fetch(new Request("https://sgi-api.test/agents/not-a-route", {
      headers: { Origin: PAGES, "CF-Connecting-IP": agentIp },
    }));
    expect(agents.status).toBe(429);
    expect(agents.headers.get("Retry-After")).toBe("60");
    expect(await agents.json()).toEqual({ error: "rate_limited" });
  });
});

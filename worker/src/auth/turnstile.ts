import { logInfo } from "../log";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const SITEVERIFY_TIMEOUT_MS = 5_000;
const TOKEN_MAX = 2048;
const DEFAULT_HOSTS = "starswarm-sgi.pages.dev,sgi.starswarm.workers.dev";

export type TurnstileAction = "device" | "google";

export interface TurnstileDecision {
  ok: boolean;
  enforce: boolean;
  reason: string;
}

interface SiteverifyBody {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
}

export function turnstileEnforce(env: Env): boolean {
  // wrangler types pins the default var as the literal "0". Runtime may be "1".
  return (env.TURNSTILE_ENFORCE as string) === "1";
}

function allowedHosts(env: Env): Set<string> {
  const raw = env.TURNSTILE_HOSTNAMES?.trim() ? env.TURNSTILE_HOSTNAMES : DEFAULT_HOSTS;
  const hosts = raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return new Set(hosts);
}

function safeErrorCode(body: SiteverifyBody): string {
  const codes = body["error-codes"];
  const first = Array.isArray(codes) ? codes[0] : "";
  if (typeof first !== "string") return "";
  return /^[a-z0-9-]{1,64}$/.test(first) ? first : "";
}

function decide(enforce: boolean, reason: string, ok: boolean): TurnstileDecision {
  if (ok) return { ok: true, enforce, reason };
  return { ok: !enforce, enforce, reason };
}

/**
 * Siteverify for a sign-in token. The secret and the token are never logged.
 * TURNSTILE_ENFORCE "0" logs and allows. "1" fails closed.
 */
export async function verifyTurnstile(
  env: Env,
  token: unknown,
  action: TurnstileAction,
  fetcher: typeof fetch = globalThis.fetch,
  timeoutMs = SITEVERIFY_TIMEOUT_MS,
): Promise<TurnstileDecision> {
  const enforce = turnstileEnforce(env);
  const secret = env.TURNSTILE_SECRET?.trim() ?? "";
  if (!secret) {
    logInfo("turnstile", { action, result: "no_secret", enforce });
    return decide(enforce, "no_secret", false);
  }
  if (typeof token !== "string" || token.length === 0 || token.length > TOKEN_MAX) {
    logInfo("turnstile", { action, result: "missing_token", enforce });
    return decide(enforce, "missing_token", false);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logInfo("turnstile", { action, result: "http_error", status: response.status, enforce });
      return decide(enforce, "http_error", false);
    }
    let body: SiteverifyBody;
    try {
      body = await response.json() as SiteverifyBody;
    } catch {
      logInfo("turnstile", { action, result: "bad_json", enforce });
      return decide(enforce, "bad_json", false);
    }
    const hosts = allowedHosts(env);
    const hostname = typeof body.hostname === "string" ? body.hostname.trim().toLowerCase() : "";
    const actionOk = body.action === action;
    const hostOk = hostname.length > 0 && hosts.has(hostname);
    const success = body.success === true && actionOk && hostOk;
    const reason = body.success !== true
      ? "rejected"
      : !actionOk
        ? "bad_action"
        : !hostOk
          ? "bad_hostname"
          : "ok";
    const code = safeErrorCode(body);
    logInfo("turnstile", {
      action,
      result: reason,
      host: hostOk ? "ok" : hostname ? "mismatch" : "missing",
      enforce,
      ...(code ? { code } : {}),
    });
    return decide(enforce, reason, success);
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "AbortError" || name === "TimeoutError";
    logInfo("turnstile", { action, result: timedOut ? "timeout" : "fetch_error", enforce });
    return decide(enforce, timedOut ? "timeout" : "fetch_error", false);
  } finally {
    clearTimeout(timer);
  }
}

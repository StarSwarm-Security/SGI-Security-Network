import { routeAgentRequest } from "agents";
import { CATALOG_NOTE, PRODUCTS } from "./catalog";
import { applyCors, preflight } from "./cors";
import { handleAnalyze } from "./analyze/handler";
import { handleAppleSignIn, handleGoogleSignIn, handleProviders } from "./auth/providers";
import { createAnonymousDevice, requireSession } from "./auth/session";
import { handleBreachStub } from "./breach/stubs";
import { loadEntitlement } from "./entitlements/load";
import { asRecord, json, readJson } from "./http";
import { llmStatus } from "./analyze/llm";
import { supportLlmEnabled } from "./support/faq";
import { handleSupportChat, handleSupportFaq } from "./support/http";
import { logError, logInfo } from "./log";
import { handleGiftCard, handleRedeemCode } from "./redeem/handler";
import { handleGetPass, handlePutPass } from "./swarm/pass";
import { handleRevenueCat } from "./webhooks/revenuecat";

type Handler = (request: Request, env: Env) => Promise<Response>;

function authed(run: (request: Request, env: Env, session: { deviceId: string; userId: string }) => Promise<Response>): Handler {
  return async (request, env) => {
    const session = await requireSession(request, env);
    if (!session.ok) return session.response;
    return run(request, env, session.session);
  };
}

const routes: Record<string, Partial<Record<string, Handler>>> = {
  "/": {
    GET: async () => json({ service: "sgi-api", health: "/v1/health" }),
  },
  "/v1/health": {
    GET: async (_request, env) => json({
      ok: true,
      service: "sgi-api",
      phase: "skeleton",
      llmEnabled: llmStatus(env).enabled,
      supportLlm: supportLlmEnabled(env),
      storage: "d1",
    }),
  },
  "/v1/catalog": {
    GET: async () => json({
      chargedByThisApi: false,
      note: CATALOG_NOTE,
      products: PRODUCTS,
    }),
  },
  "/v1/auth/device": {
    POST: async (request, env) => {
      const body = await readJson(request, 4096);
      if (!body.ok) return body.response;
      const record = asRecord(body.value);
      if (!record) return json({ error: "invalid_json" }, 400);
      const requested = record.deviceId;
      if (requested !== undefined && typeof requested !== "string") return json({ error: "invalid_device_id" }, 400);
      return createAnonymousDevice(env, requested);
    },
  },
  "/v1/auth/providers": {
    GET: async (_request, env) => handleProviders(env),
  },
  "/v1/auth/apple": {
    POST: (request, env) => handleAppleSignIn(request, env),
  },
  "/v1/auth/google": {
    POST: (request, env) => handleGoogleSignIn(request, env),
  },
  "/v1/me": {
    GET: authed(async (_request, env, session) => json({
      ...session,
      entitlement: await loadEntitlement(env, session.userId),
    })),
  },
  "/v1/entitlements": {
    GET: authed(async (_request, env, session) => json({
      entitlement: await loadEntitlement(env, session.userId),
      products: PRODUCTS,
      note: CATALOG_NOTE,
    })),
  },
  "/v1/analyze": {
    POST: authed((request, env, session) => handleAnalyze(request, env, session)),
  },
  "/v1/webhooks/revenuecat": {
    POST: (request, env) => handleRevenueCat(request, env),
  },
  "/v1/swarm-pass": {
    GET: authed((_request, env, session) => handleGetPass(env, session)),
    PUT: authed((request, env, session) => handlePutPass(request, env, session)),
  },
  "/v1/redeem/codes": {
    POST: authed((request, env, session) => handleRedeemCode(request, env, session)),
  },
  "/v1/redeem/gift-card": {
    POST: authed((request) => handleGiftCard(request)),
  },
  "/v1/breach/check": {
    POST: (request) => handleBreachStub(request),
  },
  "/v1/breach/status": {
    GET: (request) => handleBreachStub(request),
  },
  "/v1/scan/external": {
    POST: (request) => handleBreachStub(request),
  },
  "/v1/support/faq": {
    GET: async () => handleSupportFaq(),
  },
  "/v1/support/chat": {
    POST: (request, env) => handleSupportChat(request, env),
  },
};

export { SupportChat } from "./support/agent";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const methods = routes[path];
  if (!methods) return json({ error: "not_found" }, 404);
  const handler = methods[request.method];
  if (!handler) {
    return json({ error: "method_not_allowed" }, 405, { Allow: Object.keys(methods).join(", ") });
  }
  return handler(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const started = Date.now();
    if (request.method === "OPTIONS") {
      const response = preflight(request);
      logInfo("request", { method: request.method, path, status: response.status, ms: Date.now() - started });
      return response;
    }
    try {
      if (path.startsWith("/agents/")) {
        const routed = await routeAgentRequest(request, env);
        const response = !routed
          ? applyCors(request, json({ error: "not_found" }, 404))
          : request.headers.get("Upgrade") === "websocket"
            ? routed
            : applyCors(request, routed);
        logInfo("request", { method: request.method, path, status: response.status, ms: Date.now() - started });
        return response;
      }
      const response = applyCors(request, await dispatch(request, env));
      logInfo("request", { method: request.method, path, status: response.status, ms: Date.now() - started });
      return response;
    } catch (error) {
      logError("unhandled", error, { path });
      const response = applyCors(request, json({ error: "internal" }, 500));
      logInfo("request", { method: request.method, path, status: response.status, ms: Date.now() - started });
      return response;
    }
  },
} satisfies ExportedHandler<Env>;

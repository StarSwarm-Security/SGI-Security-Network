import { json } from "./http";

/** Browser origins allowed to call this API. No wildcard. */
export const ALLOWED_ORIGINS = [
  "https://starswarm-sgi.pages.dev",
  "https://sgi.starswarm.workers.dev",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
] as const;

const ALLOWED = new Set<string>(ALLOWED_ORIGINS);

export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED.has(origin);
}

export function applyCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  const origin = request.headers.get("Origin");
  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflight(request: Request): Response {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) {
    return json({ error: "origin_not_allowed" }, 403, headers);
  }
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

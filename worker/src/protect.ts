import { json } from "./http";
import { logInfo } from "./log";

const RETRY_AFTER = "60";

export function clientAddress(request: Request): string {
  const raw = request.headers.get("CF-Connecting-IP");
  if (!raw) return "";
  const ip = raw.trim();
  if (!ip || ip.length > 128 || /[\r\n]/.test(ip)) return "";
  return ip;
}

function limited(): Response {
  return json({ error: "rate_limited" }, 429, { "Retry-After": RETRY_AFTER });
}

/**
 * Workers rate limiting binding. Missing bindings and thrown lookups allow the
 * request so local tests and older deploys keep working. The key is not logged.
 */
export async function limitKey(
  binding: RateLimit | undefined,
  key: string,
): Promise<Response | null> {
  if (!binding || typeof binding.limit !== "function" || !key) return null;
  try {
    const result = await binding.limit({ key });
    if (!result || result.success !== false) return null;
    return limited();
  } catch {
    logInfo("rate_limit_unavailable", {});
    return null;
  }
}

/** Per-IP bucket. Skips when Cloudflare did not set CF-Connecting-IP. */
export async function limitIp(
  request: Request,
  binding: RateLimit | undefined,
  bucket: string,
): Promise<Response | null> {
  const ip = clientAddress(request);
  if (!ip) return null;
  return limitKey(binding, `${bucket}:${ip}`);
}

/** Per device session. The device id is already stored; the address is not. */
export async function limitSession(
  binding: RateLimit | undefined,
  deviceId: string,
): Promise<Response | null> {
  if (!deviceId) return null;
  return limitKey(binding, `session:${deviceId}`);
}

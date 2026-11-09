import { asRecord, json, readJson } from "../http";
import { limitIp } from "../protect";
import { createAnonymousDevice } from "./session";
import { verifyTurnstile } from "./turnstile";

/**
 * POST /v1/auth/device. About 5 requests a minute per CF-Connecting-IP,
 * then Turnstile action "device". The address is not stored.
 */
export async function handleDeviceAuth(
  request: Request,
  env: Env,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const limited = await limitIp(request, env.AUTH_DEVICE_LIMITER, "device");
  if (limited) return limited;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const record = asRecord(body.value);
  if (!record) return json({ error: "invalid_json" }, 400);
  const requested = record.deviceId;
  if (requested !== undefined && typeof requested !== "string") return json({ error: "invalid_device_id" }, 400);
  const turnstile = await verifyTurnstile(env, record.turnstileToken, "device", fetcher);
  if (!turnstile.ok) return json({ error: "turnstile_failed" }, 403);
  return createAnonymousDevice(env, requested);
}

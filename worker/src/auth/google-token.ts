import { logError } from "../log";

/**
 * Google ID-token checks for Workers. Web Crypto only.
 * The token is verified locally. It is never sent to Google, logged, or stored.
 * Certs are public keys, not request state, so a short module cache is safe.
 */
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;
const CACHE_MIN_MS = 60_000;
const CACHE_MAX_MS = 10 * 60_000;
const MAX_JWKS_BYTES = 64 * 1024;
const MAX_TOKEN_CHARS = 8192;
const MAX_KEYS = 8;

export type GoogleTokenFailure = "invalid" | "expired" | "email_not_verified" | "certs_unavailable";

export type GoogleTokenResult =
  | { ok: true; sub: string }
  | { ok: false; reason: GoogleTokenFailure };

interface CachedCerts {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
}

interface CertRequestInit extends RequestInit {
  cf?: { cacheTtl: number; cacheEverything: boolean };
}

let certCache: CachedCerts | null = null;
let inflight: Promise<Map<string, CryptoKey>> | null = null;
let cacheGeneration = 0;

/** Test hook. Drops the public-cert cache so the next verify fetches again. */
export function resetGoogleCertCache(): void {
  certCache = null;
  inflight = null;
  cacheGeneration += 1;
}

export async function verifyGoogleIdToken(
  token: string,
  audience: string,
  options?: { nowMs?: number; fetcher?: typeof fetch },
): Promise<GoogleTokenResult> {
  try {
    return await verifyInner(token, audience, options?.nowMs ?? Date.now(), options?.fetcher ?? globalThis.fetch);
  } catch (error) {
    logError("google_token_verify_failed", error);
    return { ok: false, reason: "invalid" };
  }
}

async function verifyInner(
  token: string,
  audience: string,
  nowMs: number,
  fetcher: typeof fetch,
): Promise<GoogleTokenResult> {
  if (audience.length === 0 || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
    return { ok: false, reason: "invalid" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return { ok: false, reason: "invalid" };

  const headerBytes = decodeBase64Url(encodedHeader);
  const signature = decodeBase64Url(encodedSignature);
  if (!headerBytes || !signature || signature.byteLength === 0) return { ok: false, reason: "invalid" };
  const header = decodeJson(headerBytes);
  if (!isRecord(header)) return { ok: false, reason: "invalid" };
  if (!supportedHeader(header)) return { ok: false, reason: "invalid" };
  const kid = header.kid;
  if (typeof kid !== "string" || !safeKid(kid)) return { ok: false, reason: "invalid" };

  const found = await keyForKid(kid, fetcher);
  if (!found.ok) return found;
  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signed = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", found.key, signature, signingInput);
  if (!signed) return { ok: false, reason: "invalid" };

  const payloadBytes = decodeBase64Url(encodedPayload);
  if (!payloadBytes) return { ok: false, reason: "invalid" };
  const payload = decodeJson(payloadBytes);
  if (!isRecord(payload)) return { ok: false, reason: "invalid" };
  return claimsResult(payload, audience, nowMs);
}

function supportedHeader(header: Record<string, unknown>): boolean {
  for (const key of Object.keys(header)) {
    if (key !== "alg" && key !== "kid" && key !== "typ") return false;
  }
  if (header.alg !== "RS256") return false;
  if (header.typ !== undefined && header.typ !== "JWT") return false;
  return true;
}

function safeKid(kid: string): boolean {
  return kid.length >= 1 && kid.length <= 128 && !/[\u0000-\u0020\u007f"\\]/.test(kid);
}

function claimsResult(payload: Record<string, unknown>, audience: string, nowMs: number): GoogleTokenResult {
  if (typeof payload.iss !== "string" || !ISSUERS.has(payload.iss)) return { ok: false, reason: "invalid" };
  if (!audienceMatches(payload.aud, payload.azp, audience)) return { ok: false, reason: "invalid" };
  if (typeof payload.sub !== "string" || !/^[\x21-\x7e]{1,255}$/.test(payload.sub)) {
    return { ok: false, reason: "invalid" };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isFinite(payload.exp) || typeof payload.exp !== "number") return { ok: false, reason: "invalid" };
  if (!Number.isFinite(payload.iat) || typeof payload.iat !== "number") return { ok: false, reason: "invalid" };
  if (payload.iat >= payload.exp) return { ok: false, reason: "invalid" };
  if (payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) return { ok: false, reason: "invalid" };
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf)) return { ok: false, reason: "invalid" };
    if (nowSeconds + CLOCK_SKEW_SECONDS < payload.nbf) return { ok: false, reason: "invalid" };
  }
  if (nowSeconds >= payload.exp + CLOCK_SKEW_SECONDS) return { ok: false, reason: "expired" };

  if ("email" in payload && payload.email !== undefined) {
    if (typeof payload.email !== "string") return { ok: false, reason: "invalid" };
    const verified = payload.email_verified;
    if (verified !== true && verified !== "true") return { ok: false, reason: "email_not_verified" };
  }

  return { ok: true, sub: payload.sub };
}

function audienceMatches(aud: unknown, azp: unknown, audience: string): boolean {
  if (azp !== undefined && azp !== audience) return false;
  if (typeof aud === "string") return aud === audience;
  if (!Array.isArray(aud) || aud.length === 0 || !aud.every((item) => typeof item === "string")) return false;
  if (!aud.includes(audience)) return false;
  if (aud.length > 1 && azp !== audience) return false;
  return true;
}

async function keyForKid(
  kid: string,
  fetcher: typeof fetch,
): Promise<{ ok: true; key: CryptoKey } | { ok: false; reason: "invalid" | "certs_unavailable" }> {
  let keys: Map<string, CryptoKey>;
  try {
    keys = await loadCerts(false, fetcher);
  } catch (error) {
    logError("google_certs_unavailable", error);
    return { ok: false, reason: "certs_unavailable" };
  }
  const cached = keys.get(kid);
  if (cached) return { ok: true, key: cached };
  try {
    keys = await loadCerts(true, fetcher);
  } catch (error) {
    logError("google_certs_unavailable", error);
    return { ok: false, reason: "certs_unavailable" };
  }
  const refreshed = keys.get(kid);
  if (!refreshed) return { ok: false, reason: "invalid" };
  return { ok: true, key: refreshed };
}

async function loadCerts(force: boolean, fetcher: typeof fetch): Promise<Map<string, CryptoKey>> {
  if (!force && certCache && certCache.expiresAt > Date.now()) return certCache.keys;
  if (!force && inflight) return inflight;
  const generation = cacheGeneration;
  const run = fetchCerts(fetcher, force).then((fresh) => {
    if (generation === cacheGeneration) certCache = fresh;
    return fresh.keys;
  });
  if (!force) inflight = run;
  try {
    return await run;
  } finally {
    if (inflight === run) inflight = null;
  }
}

async function fetchCerts(fetcher: typeof fetch, force: boolean): Promise<CachedCerts> {
  const request: CertRequestInit = force
    ? {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      }
    : {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
        cf: { cacheTtl: 600, cacheEverything: true },
      };
  const response = await fetcher(GOOGLE_JWKS_URL, request);
  if (!response.ok) throw new Error(`google_certs_http_${response.status}`);
  const bytes = await readLimited(response, MAX_JWKS_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown;
  } catch {
    throw new Error("google_certs_invalid");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.keys)) throw new Error("google_certs_invalid");
  const keys = new Map<string, CryptoKey>();
  const listed = parsed.keys.slice(0, MAX_KEYS);
  for (const entry of listed) {
    const imported = await importCert(entry);
    if (!imported) continue;
    if (!keys.has(imported.kid)) keys.set(imported.kid, imported.key);
  }
  if (keys.size === 0) throw new Error("google_certs_invalid");
  return { keys, expiresAt: Date.now() + ttlFromCacheControl(response.headers.get("Cache-Control")) };
}

async function importCert(entry: unknown): Promise<{ kid: string; key: CryptoKey } | null> {
  if (!isRecord(entry)) return null;
  if (entry.kty !== "RSA") return null;
  if (entry.alg !== undefined && entry.alg !== "RS256") return null;
  if (entry.use !== undefined && entry.use !== "sig") return null;
  if (typeof entry.kid !== "string" || !safeKid(entry.kid)) return null;
  if (typeof entry.n !== "string" || typeof entry.e !== "string") return null;
  if (!/^[A-Za-z0-9_-]+$/.test(entry.n) || !/^[A-Za-z0-9_-]+$/.test(entry.e)) return null;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: entry.n, e: entry.e, alg: "RS256" },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return { kid: entry.kid, key };
  } catch {
    return null;
  }
}

function ttlFromCacheControl(header: string | null): number {
  const match = /(?:^|,\s*)max-age=(\d+)/i.exec(header ?? "");
  if (!match) return CACHE_MAX_MS;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return CACHE_MAX_MS;
  return Math.min(CACHE_MAX_MS, Math.max(CACHE_MIN_MS, seconds * 1000));
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get("Content-Length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isFinite(size) || size < 0 || size > maxBytes) throw new Error("google_certs_invalid");
  }
  if (!response.body) throw new Error("google_certs_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("google_certs_invalid");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeBase64Url(segment: string): Uint8Array | null {
  if (segment.length === 0 || segment.length > 12_000) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
  try {
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function decodeJson(bytes: Uint8Array): unknown | null {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

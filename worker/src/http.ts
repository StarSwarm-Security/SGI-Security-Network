export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const next = new Headers(headers);
  next.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: next });
}

export async function readBoundedBytes(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; response: Response }> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isFinite(size) || size < 0) {
      return { ok: false, response: json({ error: "invalid_length" }, 400) };
    }
    if (size > maxBytes) {
      return { ok: false, response: json({ error: "payload_too_large", maxBytes }, 413) };
    }
  }
  if (!request.body) return { ok: true, bytes: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, response: json({ error: "payload_too_large", maxBytes }, 413) };
      }
      chunks.push(value);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "error";
    console.error(JSON.stringify({ message: "body_read_failed", error: detail }));
    return { ok: false, response: json({ error: "invalid_body" }, 400) };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const raw = await readBoundedBytes(request, maxBytes);
  if (!raw.ok) return raw;
  if (raw.bytes.byteLength === 0) return { ok: true, value: {} };
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw.bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: json({ error: "invalid_json" }, 400) };
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

import { runSwarm } from "../../../js/analyzers.js";
import { scanPaste } from "../../../js/paste-guard.js";
import { isDeviceType, type DeviceType } from "../catalog";

export interface SwarmResult {
  reports: unknown[];
  summary: unknown;
  meta: Record<string, unknown>;
}

export interface PasteResult {
  verdict: "safe" | "suspicious" | "dangerous";
  hits: Array<{ id: string; sev: string; title: string; why: string; fix: string }>;
  note: string;
}

function isSwarmResult(value: unknown): value is SwarmResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { reports?: unknown; summary?: unknown; meta?: unknown };
  return Array.isArray(record.reports)
    && typeof record.summary === "object"
    && record.summary !== null
    && typeof record.meta === "object"
    && record.meta !== null;
}

function isPasteResult(value: unknown): value is PasteResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { verdict?: unknown; hits?: unknown; note?: unknown };
  if (record.verdict !== "safe" && record.verdict !== "suspicious" && record.verdict !== "dangerous") return false;
  if (!Array.isArray(record.hits) || typeof record.note !== "string") return false;
  return record.hits.every((hit) => {
    if (typeof hit !== "object" || hit === null) return false;
    const row = hit as { id?: unknown; sev?: unknown; title?: unknown };
    return typeof row.id === "string" && typeof row.sev === "string" && typeof row.title === "string";
  });
}

export function runOffline(mode: "config" | "paste", text: string, deviceType: DeviceType): SwarmResult | PasteResult {
  if (mode === "paste") {
    const result: unknown = scanPaste(text);
    if (!isPasteResult(result)) throw new Error("paste_guard_shape");
    return result;
  }
  const result: unknown = runSwarm(text, { deviceType: isDeviceType(deviceType) ? deviceType : "auto" });
  if (!isSwarmResult(result)) throw new Error("analyzer_shape");
  return result;
}

import { PASS_BADGES } from "../catalog";
import type { Session } from "../auth/session";
import { asRecord, json, readJson } from "../http";
import { logError } from "../log";
import { nowIso } from "../time";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BADGE_SET = new Set<string>(PASS_BADGES);

interface PassBody {
  clientCredits: number;
  badges: string[];
  days: string[];
  tourDone: boolean;
  lastCheckIn: string | null;
}

function isDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parsePass(value: unknown): PassBody | null {
  const body = asRecord(value);
  if (!body) return null;
  if (typeof body.credits !== "number" || !Number.isInteger(body.credits) || body.credits < 0 || body.credits > 1_000_000) {
    return null;
  }
  if (!Array.isArray(body.badges) || body.badges.length > PASS_BADGES.length) return null;
  const badges: string[] = [];
  for (const badge of body.badges) {
    if (typeof badge !== "string" || !BADGE_SET.has(badge) || badges.includes(badge)) return null;
    badges.push(badge);
  }
  if (!Array.isArray(body.days) || body.days.length > 120) return null;
  const days: string[] = [];
  for (const day of body.days) {
    if (typeof day !== "string" || !isDay(day) || days.includes(day)) return null;
    days.push(day);
  }
  if (typeof body.tourDone !== "boolean") return null;
  let lastCheckIn: string | null = null;
  if (body.lastCheckIn !== null && body.lastCheckIn !== undefined) {
    if (typeof body.lastCheckIn !== "string" || !isDay(body.lastCheckIn)) return null;
    lastCheckIn = body.lastCheckIn;
  }
  return { clientCredits: body.credits, badges, days, tourDone: body.tourDone, lastCheckIn };
}

interface SnapshotRow {
  client_credits: number;
  bonus_credits: number;
  badges_json: string;
  days_json: string;
  tour_done: number;
  last_check_in: string | null;
}

const NOTE =
  "The browser localStorage ledger remains the Phase 0 source for tour, check-in, and streaks. " +
  "This snapshot is an optional copy plus server bonus credits from one-time codes. " +
  "Swarm Credits have no cash value and are not a wallet.";

function view(row: SnapshotRow | null): Record<string, unknown> {
  if (!row) {
    return {
      authoritative: false,
      synced: false,
      clientCredits: 0,
      bonusCredits: 0,
      credits: 0,
      badges: [],
      days: [],
      tourDone: false,
      lastCheckIn: null,
      note: NOTE,
    };
  }
  let badges: unknown = [];
  let days: unknown = [];
  try {
    badges = JSON.parse(row.badges_json) as unknown;
    days = JSON.parse(row.days_json) as unknown;
  } catch {
    badges = [];
    days = [];
  }
  return {
    authoritative: false,
    synced: true,
    clientCredits: row.client_credits,
    bonusCredits: row.bonus_credits,
    credits: row.client_credits + row.bonus_credits,
    badges,
    days,
    tourDone: row.tour_done === 1,
    lastCheckIn: row.last_check_in,
    note: NOTE,
  };
}

async function readSnapshot(env: Env, session: Session): Promise<SnapshotRow | null> {
  return env.DB.prepare(
    `SELECT client_credits, bonus_credits, badges_json, days_json, tour_done, last_check_in
     FROM swarm_pass_snapshots
     WHERE device_id = ?1 AND user_id = ?2`,
  ).bind(session.deviceId, session.userId).first<SnapshotRow>();
}

export async function handleGetPass(env: Env, session: Session): Promise<Response> {
  return json(view(await readSnapshot(env, session)));
}

export async function handlePutPass(request: Request, env: Env, session: Session): Promise<Response> {
  const parsed = await readJson(request, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsePass(parsed.value);
  if (!body) return json({ error: "invalid_pass" }, 400);
  const now = nowIso();
  try {
    await env.DB.prepare(
      `INSERT INTO swarm_pass_snapshots (
         device_id, user_id, client_credits, bonus_credits, badges_json, days_json,
         tour_done, last_check_in, client_updated_at, server_updated_at
       ) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT (device_id) DO UPDATE SET
         client_credits = excluded.client_credits,
         badges_json = excluded.badges_json,
         days_json = excluded.days_json,
         tour_done = excluded.tour_done,
         last_check_in = excluded.last_check_in,
         client_updated_at = excluded.client_updated_at,
         server_updated_at = excluded.server_updated_at
       WHERE swarm_pass_snapshots.user_id = excluded.user_id`,
    ).bind(
      session.deviceId,
      session.userId,
      body.clientCredits,
      JSON.stringify(body.badges),
      JSON.stringify(body.days),
      body.tourDone ? 1 : 0,
      body.lastCheckIn,
      now,
    ).run();
  } catch (error) {
    logError("pass_sync_failed", error);
    return json({ error: "internal" }, 500);
  }
  const stored = await readSnapshot(env, session);
  if (!stored) return json({ error: "pass_conflict" }, 409);
  return json(view(stored));
}

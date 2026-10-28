import type { Session } from "../auth/session";
import { asRecord, json, readJson } from "../http";
import { logError } from "../log";
import { addDaysIso, nowIso } from "../time";

const CODE_RE = /^[A-Z0-9-]{4,64}$/;

interface ClaimRow {
  code: string;
  kind: "promo" | "sc_grant" | "tier_trial";
  sc_amount: number | null;
  tier: "monthly" | "yearly" | null;
  tier_days: number | null;
}

async function bonusCredits(env: Env, session: Session): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT bonus_credits FROM swarm_pass_snapshots WHERE device_id = ?1 AND user_id = ?2`,
  ).bind(session.deviceId, session.userId).first<{ bonus_credits: number }>();
  return row?.bonus_credits ?? 0;
}

export async function handleRedeemCode(request: Request, env: Env, session: Session): Promise<Response> {
  const parsed = await readJson(request, 4096);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.value);
  if (!body || typeof body.code !== "string") return json({ error: "invalid_code" }, 400);
  const code = body.code.trim().toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: "invalid_code" }, 400);

  const prior = await env.DB.prepare(
    `SELECT c.kind FROM redeem_redemptions AS r
     JOIN redeem_codes AS c ON c.code = r.code
     WHERE r.code = ?1 AND r.device_id = ?2`,
  ).bind(code, session.deviceId).first<{ kind: string }>();
  if (prior) {
    return json({
      ok: true,
      alreadyRedeemed: true,
      kind: prior.kind,
      bonusCredits: await bonusCredits(env, session),
    });
  }

  const now = nowIso();
  let claimed: ClaimRow | null = null;
  try {
    // One statement decides the winner. D1 rejects UPDATE-inside-WITH, so the
    // grant is applied only after this UPDATE changes a row.
    const updated = await env.DB.prepare(
      `UPDATE redeem_codes
       SET use_count = use_count + 1
       WHERE code = ?1
         AND use_count < max_uses
         AND (expires_at IS NULL OR expires_at > ?2)
         AND NOT EXISTS (
           SELECT 1 FROM redeem_redemptions AS existing
           WHERE existing.code = redeem_codes.code AND existing.device_id = ?3
         )`,
    ).bind(code, now, session.deviceId).run();
    if (updated.meta.changes === 1) {
      claimed = await env.DB.prepare(
        `SELECT code, kind, sc_amount, tier, tier_days FROM redeem_codes WHERE code = ?1`,
      ).bind(code).first<ClaimRow>();
      if (!claimed) return json({ error: "internal" }, 500);
      const redemptionId = crypto.randomUUID();
      const statements = [
        env.DB.prepare(
          `INSERT INTO redeem_redemptions (id, code, device_id, user_id, redeemed_at, grant_applied)
           VALUES (?1, ?2, ?3, ?4, ?5, 1)`,
        ).bind(redemptionId, code, session.deviceId, session.userId, now),
      ];
      if (claimed.kind === "sc_grant" && claimed.sc_amount && claimed.sc_amount > 0) {
        statements.push(env.DB.prepare(
          `INSERT INTO swarm_pass_snapshots (
             device_id, user_id, client_credits, bonus_credits, badges_json, days_json,
             tour_done, last_check_in, client_updated_at, server_updated_at
           ) VALUES (?1, ?2, 0, ?3, '[]', '[]', 0, NULL, NULL, ?4)
           ON CONFLICT (device_id) DO UPDATE SET
             bonus_credits = MIN(1000000, swarm_pass_snapshots.bonus_credits + excluded.bonus_credits),
             server_updated_at = excluded.server_updated_at
           WHERE swarm_pass_snapshots.user_id = excluded.user_id`,
        ).bind(session.deviceId, session.userId, claimed.sc_amount, now));
      }
      if (claimed.kind === "tier_trial" && (claimed.tier === "monthly" || claimed.tier === "yearly") && claimed.tier_days) {
        const days = Math.min(30, Math.max(1, claimed.tier_days));
        statements.push(env.DB.prepare(
          `INSERT INTO entitlements (
             id, user_id, tier, product_id, price_cents, status, source,
             expires_at, revenuecat_event_id, created_at, updated_at
           ) VALUES (?1, ?2, ?3, ?4, NULL, 'active', 'promo', ?5, NULL, ?6, ?6)`,
        ).bind(`redeem:${redemptionId}`, session.userId, claimed.tier, `promo:${code}`, addDaysIso(days), now));
      }
      await env.DB.batch(statements);
    }
  } catch (error) {
    logError("redeem_failed", error);
    return json({ error: "internal" }, 500);
  }
  if (claimed) {
    return json({
      ok: true,
      alreadyRedeemed: false,
      kind: claimed.kind,
      granted: claimed.kind === "sc_grant"
        ? { bonusCredits: claimed.sc_amount }
        : { tier: claimed.tier, tierDays: claimed.tier_days },
      bonusCredits: await bonusCredits(env, session),
    });
  }

  const existing = await env.DB.prepare(
    `SELECT use_count, max_uses, expires_at FROM redeem_codes WHERE code = ?1`,
  ).bind(code).first<{ use_count: number; max_uses: number; expires_at: string | null }>();
  if (!existing) return json({ error: "code_unknown" }, 404);
  if (existing.expires_at && existing.expires_at <= now) return json({ error: "code_expired" }, 409);
  if (existing.use_count >= existing.max_uses) return json({ error: "code_exhausted" }, 409);
  return json({ error: "code_unavailable" }, 409);
}

/** Gift-card and crypto redeem stay closed. No wallet, transfer, or KYC call. */
export async function handleGiftCard(request: Request): Promise<Response> {
  await request.body?.cancel();
  return json({
    error: "not_available",
    todo: "XMR, SOL, ETH, and BTC gift-card redeem is not implemented. It needs a licensed partner, Terms, and possibly KYC. This stub does not create a transfer or store a wallet address.",
  }, 501);
}

import { ANALYZE_PER_DAY, type TierId } from "../catalog";
import { nowIso } from "../time";

export interface ActiveEntitlement {
  tier: TierId;
  status: "active" | "grace";
  productId: string | null;
  priceCents: number | null;
  expiresAt: string | null;
  source: "default" | "revenuecat" | "promo";
  analyzePerDay: number;
}

interface EntitlementRow {
  tier: TierId;
  status: "active" | "grace";
  product_id: string | null;
  price_cents: number | null;
  expires_at: string | null;
  source: "default" | "revenuecat" | "promo";
}

export async function loadEntitlement(env: Env, userId: string): Promise<ActiveEntitlement> {
  const row = await env.DB.prepare(
    `SELECT tier, status, product_id, price_cents, expires_at, source
     FROM entitlements
     WHERE user_id = ?1
       AND status IN ('active', 'grace')
       AND (expires_at IS NULL OR expires_at > ?2)
     ORDER BY CASE tier WHEN 'yearly' THEN 3 WHEN 'monthly' THEN 2 ELSE 1 END DESC,
              updated_at DESC
     LIMIT 1`,
  ).bind(userId, nowIso()).first<EntitlementRow>();

  if (!row) {
    return {
      tier: "free",
      status: "active",
      productId: null,
      priceCents: 0,
      expiresAt: null,
      source: "default",
      analyzePerDay: ANALYZE_PER_DAY.free,
    };
  }
  return {
    tier: row.tier,
    status: row.status,
    productId: row.product_id,
    priceCents: row.price_cents,
    expiresAt: row.expires_at,
    source: row.source,
    analyzePerDay: ANALYZE_PER_DAY[row.tier],
  };
}

export const DEVICE_TYPES = ["auto", "router", "switch", "firewall", "wireless", "pc"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export type TierId = "free" | "trial" | "monthly" | "yearly";

/** Paid Pro analyze cap. The 3-day trial and both paid plans use this limit. */
export const PRO_ANALYZE_PER_DAY = 300;

/** Trial length. Starts on the first anonymous device session, then falls back to free. */
export const TRIAL_DAYS = 3;

export const TRIAL_PRODUCT_ID = "sgi.trial.3d";
export const MONTHLY_PRODUCT_ID = "sgi.monthly.999";
export const YEARLY_PRODUCT_ID = "sgi.yearly.special_3999";

export interface CatalogProduct {
  productId: string;
  tier: Exclude<TierId, "free">;
  priceCents: number;
  label: string;
  /** Set only for the free Pro trial. Paid plans bill on their own interval. */
  trialDays: number | null;
}

/**
 * Placeholder catalog. Not live App Store, Play, or RevenueCat ids.
 * This API never charges.
 * - 3-day Pro trial: $0, product sgi.trial.3d
 * - Monthly: $9.99, product sgi.monthly.999
 * - Yearly special: $39.99, product sgi.yearly.special_3999
 * Free has no product id and stays on the account after the trial expires.
 */
export const PRODUCTS: readonly CatalogProduct[] = [
  {
    productId: TRIAL_PRODUCT_ID,
    tier: "trial",
    priceCents: 0,
    label: "Pro trial, 3 days",
    trialDays: TRIAL_DAYS,
  },
  {
    productId: MONTHLY_PRODUCT_ID,
    tier: "monthly",
    priceCents: 999,
    label: "Monthly $9.99",
    trialDays: null,
  },
  {
    productId: YEARLY_PRODUCT_ID,
    tier: "yearly",
    priceCents: 3999,
    label: "Yearly special $39.99",
    trialDays: null,
  },
];

export const CATALOG_NOTE =
  "Placeholder prices only. This API does not charge. " +
  "A 3-day Pro trial starts on the first anonymous device session and uses Pro limits, then falls back to free. " +
  "Monthly is $9.99. Yearly special is $39.99. " +
  "RevenueCat product ids are not live: sgi.trial.3d, sgi.monthly.999, sgi.yearly.special_3999.";

export const ANALYZE_PER_DAY: Record<TierId, number> = {
  free: 30,
  trial: PRO_ANALYZE_PER_DAY,
  monthly: PRO_ANALYZE_PER_DAY,
  yearly: PRO_ANALYZE_PER_DAY,
};

export function productById(productId: string): CatalogProduct | undefined {
  return PRODUCTS.find((product) => product.productId === productId);
}

export function isDeviceType(value: string): value is DeviceType {
  return (DEVICE_TYPES as readonly string[]).includes(value);
}

export const PASS_BADGES = ["scout", "sentinel", "swarm-lead", "tour", "streak7", "streak30"] as const;

export const ANALYZE_MAX_TEXT_BYTES = 64 * 1024;

export const DEVICE_TYPES = ["auto", "router", "switch", "firewall", "wireless", "pc"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export type TierId = "free" | "monthly" | "yearly";

export interface CatalogProduct {
  productId: string;
  tier: Exclude<TierId, "free">;
  priceCents: number;
  label: string;
}

/**
 * Placeholder catalog. Not live App Store, Play, or RevenueCat ids.
 * Monthly covers the $1.00–$9.00 band with the two endpoints.
 * Yearly is the $49.99 special. This API never charges.
 */
export const PRODUCTS: readonly CatalogProduct[] = [
  {
    productId: "sgi.monthly.placeholder_1",
    tier: "monthly",
    priceCents: 100,
    label: "Monthly placeholder $1.00",
  },
  {
    productId: "sgi.monthly.placeholder_9",
    tier: "monthly",
    priceCents: 900,
    label: "Monthly placeholder $9.00",
  },
  {
    productId: "sgi.yearly.special_4999",
    tier: "yearly",
    priceCents: 4999,
    label: "Yearly special $49.99",
  },
];

export const ANALYZE_PER_DAY: Record<TierId, number> = {
  free: 30,
  monthly: 300,
  yearly: 2000,
};

export function productById(productId: string): CatalogProduct | undefined {
  return PRODUCTS.find((product) => product.productId === productId);
}

export function isDeviceType(value: string): value is DeviceType {
  return (DEVICE_TYPES as readonly string[]).includes(value);
}

export const PASS_BADGES = ["scout", "sentinel", "swarm-lead", "tour", "streak7", "streak30"] as const;

export const ANALYZE_MAX_TEXT_BYTES = 64 * 1024;

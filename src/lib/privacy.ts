import type { ServicePrices } from "./types";

// Re-exported from the shared role-hierarchy module so there is exactly one
// definition of the money-privacy rule across the app.
export { canSeeMoney } from "./roles";

/** Default per-service prices from the workbook (haircut $23, color $85). */
export const DEFAULT_SERVICE_PRICES: ServicePrices = { haircut: 23, color: 85 };

/**
 * Resolve a salon's service prices. Precedence: admin config override (if any) →
 * the salon's own prices → the workbook defaults. Keeps prices fully
 * configurable (spec §5) while always returning a complete price object.
 */
export function servicePricesFor(
  salon?: { servicePrices?: ServicePrices },
  override?: ServicePrices,
): ServicePrices {
  return { ...DEFAULT_SERVICE_PRICES, ...(salon?.servicePrices ?? {}), ...(override ?? {}) };
}

import type { Role, ServicePrices } from "./types";

/**
 * Privacy rule (spec §4): stylists must NEVER see revenue / production dollars /
 * monetary totals. Managers, SDLs, owners and admins do.
 *
 * Stylists only ever see: hours (scheduled/actual/adjusted), pay rates
 * (guarantee & effective), service counts (haircuts/colors), services-per-hour,
 * and over/short expressed in non-dollar (service/hour) terms.
 *
 * Use this single helper everywhere so the rule stays consistent. Pay RATES
 * ($/hr) are allowed for stylists — only production/revenue TOTALS are hidden.
 */
export function canSeeMoney(role: Role): boolean {
  return role !== "stylist";
}

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

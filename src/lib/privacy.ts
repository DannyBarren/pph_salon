import type { ServicePrices } from "./types";
import { getActivePaymentLogic } from "./paymentLogic";

// Re-exported from the shared role-hierarchy module so there is exactly one
// definition of the money-privacy rule across the app.
export { canSeeMoney } from "./roles";

/** Default per-service prices from the workbook (haircut $23, color $85). */
export const DEFAULT_SERVICE_PRICES: ServicePrices = { haircut: 23, color: 85 };

/**
 * The service prices used across production ↔ service-count math.
 *
 * Payment logic is GLOBAL ONLY: this always returns the organisation-wide
 * service prices from the global payment logic. There are no per-salon price
 * overrides.
 */
export function servicePricesFor(): ServicePrices {
  const logic = getActivePaymentLogic();
  return { haircut: logic.haircutPrice, color: logic.colorPrice };
}

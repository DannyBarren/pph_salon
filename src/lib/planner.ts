/**
 * Planner ("What If") core calculation logic — pure, framework-free functions.
 *
 * Service prices are configurable (spec §5): pass a {@link PlannerPrices} sourced
 * from `Salon.servicePrices`; they default to the workbook values (haircut $23,
 * color $85). The commission (net-production) rate defaults to 0.4.
 *
 * All functions clamp to sane, non-negative values and handle the 0-hour
 * (full-week call-off) case gracefully.
 */

import { getActivePaymentLogic } from "@/lib/paymentLogic";

// Legacy fallbacks (workbook values). The live defaults come from the global
// payment logic — see `activePrices()` / `getActiveCommissionRate()`.
export const DEFAULT_HAIRCUT_PRICE = 23;
export const DEFAULT_COLOR_PRICE = 85;
export const COMMISSION_RATE = 0.4;

/** The active (admin-configured) net-production commission rate. */
export function getActiveCommissionRate(): number {
  return getActivePaymentLogic().commissionRate;
}

/** The active (admin-configured) global service prices. */
export function activePrices(): PlannerPrices {
  const logic = getActivePaymentLogic();
  return { haircut: logic.haircutPrice, color: logic.colorPrice };
}

/** Fraction of target production the auto-snap aims to earn from haircuts. */
export const DEFAULT_HAIRCUT_VALUE_SHARE = 0.55;

/** Above this services/hour we flag the plan as unrealistic. */
export const REALISM_SERVICES_PER_HOUR = 4;

export interface PlannerPrices {
  haircut: number;
  color: number;
}

export interface ServiceMix {
  haircuts: number;
  colors: number;
}

const clampCount = (n: number) => Math.max(0, Math.round(Number.isFinite(n) ? n : 0));

/** Guard against a 0/negative/NaN service price (e.g. an admin typo) → no div-by-zero. */
function safePrices(prices: PlannerPrices): PlannerPrices {
  return {
    haircut: prices.haircut > 0 ? prices.haircut : DEFAULT_HAIRCUT_PRICE,
    color: prices.color > 0 ? prices.color : DEFAULT_COLOR_PRICE,
  };
}

/**
 * Production ($) required to hit a desired effective pay rate over the planned
 * hours. Returns 0 when the target is at/under the guarantee (always achievable
 * — the floor pays it regardless of production).
 */
export function getRequiredProduction(
  scheduledHrs: number,
  desiredPayRate: number,
  guaranteeRate: number,
  commissionRate: number = getActiveCommissionRate(),
): number {
  if (scheduledHrs <= 0) return 0; // full-week call-off: nothing to produce
  if (desiredPayRate <= guaranteeRate) return 0;
  const pph = Math.round(desiredPayRate / commissionRate);
  return pph * scheduledHrs;
}

/**
 * Best-spread service mix for a production target: earns ~55% of the value from
 * haircuts, then forces the colors count so the totals land exactly on target.
 */
export function snapServiceMix(
  targetProduction: number,
  prices: PlannerPrices = activePrices(),
  haircutValueShare: number = DEFAULT_HAIRCUT_VALUE_SHARE,
): ServiceMix {
  if (targetProduction <= 0) return { haircuts: 0, colors: 0 };
  const p = safePrices(prices);
  const haircuts = clampCount((targetProduction * haircutValueShare) / p.haircut);
  // Force exact match: solve colors from whatever haircuts leave behind.
  const colors = clampCount((targetProduction - haircuts * p.haircut) / p.color);
  return { haircuts, colors };
}

/**
 * Linked-slider adjustment: when the user drags one service count, recompute the
 * other so total production stays on target. The dragged value is respected;
 * the counterpart absorbs the difference (never negative).
 */
export function adjustLinkedSlider(
  changed: "haircuts" | "colors",
  newValue: number,
  targetProduction: number,
  prices: PlannerPrices = activePrices(),
): ServiceMix {
  const value = clampCount(newValue);
  const p = safePrices(prices);
  if (changed === "haircuts") {
    const remaining = targetProduction - value * p.haircut;
    return { haircuts: value, colors: clampCount(remaining / p.color) };
  }
  const remaining = targetProduction - value * p.color;
  return { haircuts: clampCount(remaining / p.haircut), colors: value };
}

/** Total production ($) from a service mix. */
export function productionOf(mix: ServiceMix, prices: PlannerPrices = activePrices()): number {
  return mix.haircuts * prices.haircut + mix.colors * prices.color;
}

/** Services per scheduled hour (0 when no hours are planned). */
export function servicesPerHour(mix: ServiceMix, scheduledHrs: number): number {
  const total = mix.haircuts + mix.colors;
  return scheduledHrs > 0 ? total / scheduledHrs : 0;
}

/**
 * Effective $/hr for a planned mix + hours, honoring the guarantee floor.
 * A 0-hour week (call-off) yields 0 (no hours worked → no pay).
 */
export function effectiveRate(
  mix: ServiceMix,
  scheduledHrs: number,
  guaranteeRate: number,
  commissionRate: number = getActiveCommissionRate(),
  prices: PlannerPrices = activePrices(),
): number {
  if (scheduledHrs <= 0) return 0;
  const production = productionOf(mix, prices);
  const pay = Math.max(production * commissionRate, scheduledHrs * guaranteeRate);
  return pay / scheduledHrs;
}

export interface PlanFeasibility {
  servicesPerHour: number;
  /** True when the plan exceeds a realistic services/hour ceiling. */
  unrealistic: boolean;
  /** Human-readable warning, or null when the plan looks achievable. */
  warning: string | null;
}

/** Assess whether a planned mix is realistically deliverable in the hours. */
export function assessFeasibility(mix: ServiceMix, scheduledHrs: number): PlanFeasibility {
  const sph = servicesPerHour(mix, scheduledHrs);
  if (scheduledHrs <= 0) {
    const total = mix.haircuts + mix.colors;
    return {
      servicesPerHour: 0,
      unrealistic: total > 0,
      warning: total > 0 ? "You've planned 0 hours — no services can be booked during a full call-off." : null,
    };
  }
  const unrealistic = sph > REALISM_SERVICES_PER_HOUR;
  return {
    servicesPerHour: sph,
    unrealistic,
    warning: unrealistic
      ? `That's ${sph.toFixed(1)} services/hour — likely unrealistic. Add hours or lower the target.`
      : null,
  };
}

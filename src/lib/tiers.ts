/**
 * Tiered, Excel-accurate PPH pay engine (frontend).
 *
 * This is the TypeScript port of the canonical backend engine
 * (`backend/app/services/pay_engine.py` → `PayPlanEngine`) and the tier table
 * documented in `docs/pay-plan-logic.md`. It reproduces the math in
 * `docs/spec/PPH Based Payplan.xlsx` (sheets **Sched View** for Rebeca and
 * **Actual** for Steph) exactly.
 *
 * The Team Dashboard is built on these pure functions so every number a manager
 * sees traces back to the same source of truth as the backend.
 *
 * ⚠️ Keep this file in agreement with the backend engine and the worked
 * examples in `docs/pay-plan-logic.md`. The zero-dependency regression checks in
 * `scripts/test-team-calculations.mjs` assert the exact workbook values.
 *
 * This tiered engine is now the single source of truth for effective $/hr across
 * the whole UI: `src/lib/payEngine.ts` (stylist dashboard + overview) delegates
 * to it, so a stylist's rate is identical on their own dashboard and the team
 * roll-up. `scripts/test-dashboard-parity.mjs` guards against regressing to the
 * old flat-commission approximation.
 */

/** A single pay tier: the PPH (production per hour) required to earn `payRate`. */
export interface Tier {
  /** Hourly pay rate ($/hr). */
  payRate: number;
  /** Production-per-hour required to earn this rate. */
  pphRequired: number;
}

/**
 * Pay tiers hardcoded from `PPH Based Payplan.xlsx` (columns B & C, identical on
 * both the "Sched View" and "Actual" sheets). The underlying relationship is
 * `payRate = roundHalfUp(pph * NP_RATE)`, but the table is stored explicitly so
 * results match the workbook to the cent.
 */
export const PPH_TIERS: readonly Tier[] = [
  { payRate: 11, pphRequired: 28 },
  { payRate: 12, pphRequired: 30 },
  { payRate: 13, pphRequired: 33 },
  { payRate: 14, pphRequired: 35 },
  { payRate: 15, pphRequired: 38 },
  { payRate: 16, pphRequired: 40 },
  { payRate: 17, pphRequired: 43 },
  { payRate: 18, pphRequired: 45 },
  { payRate: 19, pphRequired: 48 },
  { payRate: 20, pphRequired: 50 },
  { payRate: 21, pphRequired: 53 },
  { payRate: 22, pphRequired: 55 },
  { payRate: 23, pphRequired: 58 },
  { payRate: 24, pphRequired: 60 },
  { payRate: 25, pphRequired: 63 },
  { payRate: 26, pphRequired: 65 },
  { payRate: 27, pphRequired: 68 },
  { payRate: 28, pphRequired: 70 },
  { payRate: 29, pphRequired: 73 },
] as const;

/** Net-production share implied by the tiers (cell B6 on both sheets). */
export const NP_RATE = 0.4;
/** Net-profit percentage surfaced on the sheet (column O, ≈ 19.5%). */
export const NP_PERCENT = 0.195;
/** Per-service production values (cells T6 / AC6). */
export const HAIRCUT_PRICE = 23;
export const COLOR_PRICE = 85;

export const MIN_TIER = PPH_TIERS[0];
export const MAX_TIER = PPH_TIERS[PPH_TIERS.length - 1];

/** Half-up rounding (banker-free) so `payRate = roundHalfUp(pph * 0.4)`. */
export function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}

/**
 * PPH required to earn `payRate`. Exact tier value when `payRate` is a table
 * row; otherwise the exact `payRate / NP_RATE` relationship for off-tier rates.
 */
export function pphForRate(payRate: number): number {
  const exact = PPH_TIERS.find((t) => t.payRate === payRate);
  return exact ? exact.pphRequired : payRate / NP_RATE;
}

/**
 * Weekly production required to earn `desiredPayRate` over `scheduledHours`
 * (column K in the sheet): `pphForRate(rate) * scheduledHours`.
 */
export function getRequiredProductionForPayRate(scheduledHours: number, desiredPayRate: number): number {
  return pphForRate(desiredPayRate) * scheduledHours;
}

/**
 * The guarantee floor expressed as production ("Min Exptd Svcs", cell N3).
 * Uses the *exact* `guaranteeRate / NP_RATE` (not the rounded tier PPH),
 * matching the workbook: guarantee 12 → 817.5, guarantee 13 → 910.
 */
export function minExpectedProduction(scheduledHours: number, guaranteeRate: number): number {
  return (guaranteeRate / NP_RATE) * scheduledHours;
}

/**
 * The effective pay rate earned for an `achievedPph`.
 *
 * - **Step (default):** the pay rate of the highest tier whose
 *   `pphRequired <= achievedPph`. A stylist must fully reach a tier's PPH to
 *   earn its rate — partial progress does not round up.
 * - **Interpolate (opt-in):** linearly interpolate between the two surrounding
 *   tiers for a smooth "partway to next tier" readout.
 *
 * In both modes the result is floored at `guaranteeRate` (never earn below
 * guarantee).
 */
export function getEffectiveRateFromPph(
  achievedPph: number,
  guaranteeRate: number,
  opts: { interpolate?: boolean; applyGuarantee?: boolean } = {},
): number {
  const { interpolate = false, applyGuarantee = true } = opts;
  const tiers = PPH_TIERS;

  if (achievedPph < tiers[0].pphRequired) {
    return applyGuarantee ? guaranteeRate : 0;
  }

  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].pphRequired <= achievedPph) idx = i;
    else break;
  }
  const base = tiers[idx];

  let rate: number;
  if (interpolate && idx + 1 < tiers.length && achievedPph > base.pphRequired) {
    const nxt = tiers[idx + 1];
    const span = nxt.pphRequired - base.pphRequired;
    const frac = span ? (achievedPph - base.pphRequired) / span : 0;
    rate = base.payRate + frac * (nxt.payRate - base.payRate);
  } else {
    rate = base.payRate;
  }

  return applyGuarantee ? Math.max(rate, guaranteeRate) : rate;
}

/**
 * The current effective pay rate for a stylist given production + actual hours.
 * This is the headline "$/hr" a manager cares about.
 */
export function getCurrentEffectivePayRate(
  production: number,
  actualHours: number,
  guaranteeRate: number,
  opts: { interpolate?: boolean } = {},
): number {
  if (actualHours <= 0) return 0;
  const pph = production / actualHours;
  return getEffectiveRateFromPph(pph, guaranteeRate, opts);
}

/** Production per hour for a block of work. */
export function getPph(production: number, hours: number): number {
  return hours > 0 ? production / hours : 0;
}

/** The tier a stylist has fully achieved for a given PPH (or null if below the floor). */
export function getAchievedTier(achievedPph: number): Tier | null {
  let achieved: Tier | null = null;
  for (const t of PPH_TIERS) {
    if (t.pphRequired <= achievedPph) achieved = t;
    else break;
  }
  return achieved;
}

/**
 * The next tier above `currentPayRate`. Returns null once the stylist is at (or
 * above) the top of the table.
 */
export function getNextTier(currentPayRate: number): Tier | null {
  return PPH_TIERS.find((t) => t.payRate > currentPayRate) ?? null;
}

/** The tier row for an exact pay rate, if it exists. */
export function getTierByRate(payRate: number): Tier | null {
  return PPH_TIERS.find((t) => t.payRate === payRate) ?? null;
}

export interface OverShort {
  /** Actual production minus the required production. Negative = short. */
  productionDelta: number;
  /** True when the stylist has met/exceeded the requirement. */
  isOver: boolean;
  /** Fraction of the requirement achieved (0-1+, clamped ≥ 0). */
  pctOfTarget: number;
}

/**
 * Over/short vs a production requirement (the sheet's "Made vs Needed" logic).
 */
export function calculateOverShort(actualProduction: number, requiredProduction: number): OverShort {
  const productionDelta = actualProduction - requiredProduction;
  return {
    productionDelta,
    isOver: productionDelta >= 0,
    pctOfTarget: requiredProduction > 0 ? Math.max(0, actualProduction / requiredProduction) : 1,
  };
}

export interface RemainingToSustain {
  requiredTotal: number;
  productionSoFar: number;
  remainingProduction: number;
  hoursRemaining: number;
  /** PPH the stylist must average over the remaining hours. */
  requiredPphRemaining: number;
}

/**
 * How much more production is needed to *sustain* (or reach) `desiredPayRate`
 * for the rest of the week, respecting hours already worked.
 */
export function remainingToSustain(
  desiredPayRate: number,
  scheduledHours: number,
  productionSoFar: number,
  hoursRemaining: number,
): RemainingToSustain {
  const requiredTotal = getRequiredProductionForPayRate(scheduledHours, desiredPayRate);
  const remainingProduction = Math.max(0, requiredTotal - productionSoFar);
  return {
    requiredTotal,
    productionSoFar,
    remainingProduction,
    hoursRemaining,
    requiredPphRemaining: hoursRemaining > 0 ? remainingProduction / hoursRemaining : 0,
  };
}

export interface ServiceMix {
  haircuts: number;
  colors: number;
}

/**
 * Translate a production target into service counts. Mirrors the workbook's two
 * pure scenarios (all-haircuts / all-colors) plus a blended split. `haircutShare`
 * is the fraction of *production* allocated to haircuts.
 */
export function productionToServices(production: number, haircutShare = 0.5): {
  allHaircuts: number;
  allColors: number;
  blended: ServiceMix;
} {
  const hcProd = production * haircutShare;
  const coProd = production * (1 - haircutShare);
  return {
    allHaircuts: Math.ceil(production / HAIRCUT_PRICE),
    allColors: Math.ceil(production / COLOR_PRICE),
    blended: {
      haircuts: Math.ceil(hcProd / HAIRCUT_PRICE),
      colors: Math.ceil(coProd / COLOR_PRICE),
    },
  };
}

/**
 * Weekly expected service counts to hit a pay rate over `scheduledHours`
 * (the sheet's haircuts/colors helper columns). Uses a blended split by default.
 */
export function getWeeklyExpectedServices(
  scheduledHours: number,
  payRate: number,
  haircutShare = 0.5,
): ServiceMix {
  const required = getRequiredProductionForPayRate(scheduledHours, payRate);
  return productionToServices(required, haircutShare).blended;
}

/**
 * Per-day required production to hold `payRate`, given each day's scheduled
 * hours (the sheet's cols D–J): `pphForRate(rate) * dailyHours[d]`.
 */
export function getExpectedDailyServices(dailyHours: number[], payRate: number): number[] {
  const pph = pphForRate(payRate);
  return dailyHours.map((h) => pph * h);
}

export interface TierProgress {
  achieved: Tier | null;
  next: Tier | null;
  /** Fraction of the way from the achieved tier's PPH to the next tier's PPH. */
  fractionToNext: number;
  achievedPph: number;
}

/**
 * Progress from the currently-achieved tier toward the next one, expressed as a
 * 0-1 fraction for progress bars / rings.
 */
export function getTierProgress(production: number, hours: number, guaranteeRate: number): TierProgress {
  const achievedPph = getPph(production, hours);
  const achieved = getAchievedTier(achievedPph);
  const currentRate = achieved?.payRate ?? guaranteeRate;
  const next = getNextTier(currentRate);

  if (!next) return { achieved, next: null, fractionToNext: 1, achievedPph };

  const floor = achieved?.pphRequired ?? 0;
  const span = next.pphRequired - floor;
  const fraction = span > 0 ? Math.max(0, Math.min(1, (achievedPph - floor) / span)) : 0;
  return { achieved, next, fractionToNext: fraction, achievedPph };
}

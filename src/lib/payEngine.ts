import type { DayRecord, PayConfig } from "./types";
import {
  NP_RATE,
  getCurrentEffectivePayRate,
  getEffectiveRateFromPph,
  getRequiredProductionForPayRate,
} from "./tiers";

export function guaranteeRateFor(salonId: string, config: PayConfig): number {
  return config.salonGuarantee[salonId] ?? config.guaranteeRate;
}

export interface PeriodSummary {
  scheduledHours: number;
  workedHours: number;
  productionToDate: number;
  haircuts: number;
  colors: number;
  scheduledDays: number;
  completedDays: number;
  remainingDays: number;
  remainingScheduledHours: number;
  /** Pay earned so far on completed days. */
  commissionPay: number;
  guaranteePay: number;
  pay: number;
  /** Effective $/hr on completed work. */
  effectiveRate: number;
  /** Whether guarantee is currently carrying the pay (commission below floor). */
  onGuarantee: boolean;
}

/**
 * Aggregate a set of day records for one stylist into a period summary.
 *
 * Effective $/hr uses the SAME Excel-accurate tiered PPH engine as the Team
 * Dashboard (`tiers.ts`), so a stylist's headline rate is identical on their own
 * dashboard and in the manager roll-up. Pass `guaranteeRate` to honor the
 * per-employee guarantee (falls back to the salon/global floor).
 */
export function summarize(
  days: DayRecord[],
  salonId: string,
  config: PayConfig,
  guaranteeRate?: number,
): PeriodSummary {
  const guarantee = guaranteeRate ?? guaranteeRateFor(salonId, config);
  let scheduledHours = 0;
  let workedHours = 0;
  let productionToDate = 0;
  let haircuts = 0;
  let colors = 0;
  let scheduledDays = 0;
  let completedDays = 0;
  let remainingDays = 0;
  let remainingScheduledHours = 0;

  for (const d of days) {
    if (d.scheduledHours > 0) {
      scheduledHours += d.scheduledHours;
      scheduledDays += 1;
    }
    // A day counts as "actual" once it has recorded activity (worked hours or
    // production) — regardless of the calendar date. This makes admin imports
    // and manual entries reflect immediately, and still treats generated future
    // days (scheduled but empty) as remaining.
    const hasActual = d.workedHours > 0 || d.production > 0;
    if (hasActual) {
      workedHours += d.workedHours;
      productionToDate += d.production;
      haircuts += d.haircuts;
      colors += d.colors;
      completedDays += 1;
    } else if (d.scheduledHours > 0) {
      remainingDays += 1;
      remainingScheduledHours += d.scheduledHours;
    }
  }

  // Tiered, workbook-accurate effective rate (production-per-hour → pay tier,
  // floored at the guarantee) — identical to the Team Dashboard.
  const effectiveRate = getCurrentEffectivePayRate(productionToDate, workedHours, guarantee);
  const tierRateNoFloor =
    workedHours > 0 ? getEffectiveRateFromPph(productionToDate / workedHours, guarantee, { applyGuarantee: false }) : 0;
  const onGuarantee = workedHours > 0 && tierRateNoFloor < guarantee;
  const pay = effectiveRate * workedHours;
  // Informational splits (not the rate driver): net-production commission vs floor.
  const commissionPay = productionToDate * NP_RATE;
  const guaranteePay = workedHours * guarantee;

  return {
    scheduledHours,
    workedHours,
    productionToDate,
    haircuts,
    colors,
    scheduledDays,
    completedDays,
    remainingDays,
    remainingScheduledHours,
    commissionPay,
    guaranteePay,
    pay,
    effectiveRate,
    onGuarantee,
  };
}

export interface PlannerInput {
  targetRate: number;
  extraHours: number;
  /** Projection mix of haircuts (0-1); overrides config default for projection. */
  serviceMixHaircut: number;
}

export interface PlannerResult {
  guaranteeRate: number;
  /** Total hours the plan assumes (scheduled + extra). */
  planHours: number;
  /** Pay target for the whole period at the chosen rate. */
  targetPay: number;
  /** Production required across the whole period to hit the target via commission. */
  requiredProduction: number;
  productionToDate: number;
  /** Production still needed for the rest of the period. */
  remainingProduction: number;
  remainingDays: number;
  perDayProduction: number;
  /** Projected service counts for the remaining production. */
  projectedHaircuts: number;
  projectedColors: number;
  projectedServices: number;
  perDayServices: number;
  avgTicket: number;
  /** True if target rate is at/under the guarantee floor (always achievable). */
  belowGuarantee: boolean;
  /** Current pace projection for the full period if trajectory continues. */
  pacedProduction: number;
  pacedRate: number;
  /** How feasible the plan is vs. minimum-services capacity (0-1+, 1 = on track). */
  feasibility: number;
}

/**
 * Core "What If" engine. Given a period summary and a target effective rate,
 * compute what production / services are still required. Driven entirely by the
 * admin PayConfig so changes there flow through instantly.
 */
export function plan(
  summary: PeriodSummary,
  config: PayConfig,
  input: PlannerInput,
  guaranteeRate: number,
): PlannerResult {
  const { avgTicketHaircut, avgTicketColor, minServicesPerDay } = config;

  const planHours = summary.scheduledHours + input.extraHours;
  const targetPay = input.targetRate * planHours;

  // Production required to earn the target rate, via the tiered PPH ladder
  // (same source of truth as the Team Dashboard + backend).
  const requiredProduction = getRequiredProductionForPayRate(planHours, input.targetRate);
  const remainingProduction = Math.max(0, requiredProduction - summary.productionToDate);

  // Add extra hours to capacity as additional working days-equivalent.
  const remainingDays = summary.remainingDays;
  const perDayProduction = remainingDays > 0 ? remainingProduction / remainingDays : remainingProduction;

  const mix = input.serviceMixHaircut;
  const avgTicket = mix * avgTicketHaircut + (1 - mix) * avgTicketColor;
  const projectedServices = avgTicket > 0 ? remainingProduction / avgTicket : 0;
  const projectedHaircuts = projectedServices * mix;
  const projectedColors = projectedServices * (1 - mix);
  const perDayServices = remainingDays > 0 ? projectedServices / remainingDays : projectedServices;

  // Current-pace projection for the whole period, scored on the tiered engine.
  const ratePerCompletedHour = summary.workedHours > 0 ? summary.productionToDate / summary.workedHours : 0;
  const pacedProduction = summary.productionToDate + ratePerCompletedHour * summary.remainingScheduledHours;
  const pacedRate = getEffectiveRateFromPph(planHours > 0 ? pacedProduction / planHours : 0, guaranteeRate);

  // Feasibility: required services/day vs realistic capacity ceiling.
  const capacityPerDay = Math.max(minServicesPerDay, minServicesPerDay * 1.8);
  const feasibility = perDayServices > 0 ? Math.min(1.4, capacityPerDay / perDayServices) : 1.4;

  return {
    guaranteeRate,
    planHours,
    targetPay,
    requiredProduction,
    productionToDate: summary.productionToDate,
    remainingProduction,
    remainingDays,
    perDayProduction,
    projectedHaircuts,
    projectedColors,
    projectedServices,
    perDayServices,
    avgTicket,
    belowGuarantee: input.targetRate <= guaranteeRate + 0.001,
    pacedProduction,
    pacedRate,
    feasibility,
  };
}

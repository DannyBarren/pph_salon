import type { DayRecord, PayConfig } from "./types";
import { TODAY } from "./time";

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

/** Aggregate a set of day records for one stylist into a period summary. */
export function summarize(days: DayRecord[], salonId: string, config: PayConfig): PeriodSummary {
  const guarantee = guaranteeRateFor(salonId, config);
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
    const completed = d.date < TODAY;
    if (completed) {
      workedHours += d.workedHours;
      productionToDate += d.production;
      haircuts += d.haircuts;
      colors += d.colors;
      if (d.workedHours > 0) completedDays += 1;
    } else if (d.scheduledHours > 0) {
      remainingDays += 1;
      remainingScheduledHours += d.scheduledHours;
    }
  }

  const commissionPay = productionToDate * config.commissionRate;
  const guaranteePay = workedHours * guarantee;
  const pay = Math.max(commissionPay, guaranteePay);
  const effectiveRate = workedHours > 0 ? pay / workedHours : 0;

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
    onGuarantee: guaranteePay >= commissionPay,
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
  const { commissionRate, avgTicketHaircut, avgTicketColor, minServicesPerDay } = config;

  const planHours = summary.scheduledHours + input.extraHours;
  const targetPay = input.targetRate * planHours;

  // Production required so that commission alone hits the target pay.
  const requiredProduction = commissionRate > 0 ? targetPay / commissionRate : 0;
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

  // Current-pace projection for the whole period.
  const ratePerCompletedHour = summary.workedHours > 0 ? summary.productionToDate / summary.workedHours : 0;
  const pacedProduction = summary.productionToDate + ratePerCompletedHour * summary.remainingScheduledHours;
  const pacedPay = Math.max(pacedProduction * commissionRate, planHours * guaranteeRate);
  const pacedRate = planHours > 0 ? pacedPay / planHours : 0;

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

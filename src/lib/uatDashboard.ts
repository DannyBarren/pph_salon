/**
 * Stylist-dashboard presentation model — a faithful port of the client's UAT 2
 * spreadsheet ("Holliean" tab) and the "For Developers 2026-07-29" PDF.
 *
 * This is a PURE PRESENTATION layer: it only *composes* the existing (correct)
 * pay engine (`src/lib/tiers.ts`) and the global payment-logic config
 * (`paymentLogic.ts`) into the exact metrics/labels the spreadsheet shows. It
 * introduces NO new pay logic.
 *
 * Formula map (letters from the PDF):
 *   A  Desired Payrate (DPR)          = selected DPR
 *   B  Req Svc Per Hr (PPH)           = ceil(DPR / NP)          → `pphForRate`
 *   C  Req Svc Rev ($)                = Sched Hrs × B           → `getRequiredProductionForPayRate`
 *   D  Svc Pay at DPR                 = Sched Hrs × DPR
 *   E  Pay Rate at current Perf       = tier lookup of Curr PPH, floored at guarantee
 *   F  Hrs To Date                    = Σ actual hours
 *   G  Services To Date               = Σ actual service revenue
 *   H  Curr PPH                       = G / F
 *   I  Curr Svcs                      = Σ cuts & Σ colors
 *   J  Potential Svc Pay              = E × F
 *   K  Gap                            = Recap − Metrics (per column)
 *   L  Daily PPH                      = round(day rev / day actual hrs) vs round(daily req rev / day sched)
 *
 * Service counts use the global config's haircut/color prices (admin-editable),
 * exactly like the spreadsheet's `ROUNDUP(rev / price)`.
 */

import type { DayRecord } from "@/lib/types";
import { getActivePaymentLogic } from "@/lib/paymentLogic";
import {
  getEffectiveRateFromPph,
  getRequiredProductionForPayRate,
  pphForRate,
} from "@/lib/tiers";

export interface DprMetrics {
  /** (A) Desired Pay Rate. */
  dpr: number;
  /** Total scheduled hours for the week. */
  schedHrs: number;
  /** (C) Required service revenue = schedHrs × reqPph. */
  reqSvcRev: number;
  /** (B) Required PPH = ceil(DPR / NP). */
  reqPph: number;
  /** Weekly required haircuts / colors (rev ÷ price, rounded up). */
  reqHaircuts: number;
  reqColors: number;
  /** (D) Service pay at DPR = schedHrs × DPR. */
  svcPayAtDpr: number;
}

export interface Recap {
  /** (E) Pay rate at current performance (tier lookup, floored at guarantee). */
  payRateAtPerf: number;
  /** (F) Hours to date (actual). */
  hrsToDate: number;
  /** (G) Services to date (actual service revenue). */
  servicesToDate: number;
  /** (H) Current PPH = services ÷ hours. */
  currPph: number;
  /** (I) Current haircuts / colors done. */
  currHaircuts: number;
  currColors: number;
  /** (J) Potential service pay = payRateAtPerf × hrsToDate. */
  potentialSvcPay: number;
}

export interface Gap {
  payrate: number;
  hrs: number;
  svcRev: number;
  pph: number;
  haircuts: number;
  colors: number;
  pay: number;
}

export interface DailyRow {
  date: string;
  /** True when the day was scheduled (drives whether the row shows values). */
  scheduled: boolean;
  actualRev: number;
  goalRev: number;
  actualHaircuts: number;
  reqHaircuts: number;
  actualColors: number;
  reqColors: number;
  actualHrs: number;
  schedHrs: number;
  /** Rounded whole-dollar day PPH (actual) and required, for "$14 vs $35". */
  actualPph: number;
  reqPph: number;
}

export interface WeekComputation {
  metrics: DprMetrics;
  recap: Recap;
  gap: Gap;
  daily: DailyRow[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ceilDiv = (n: number, d: number) => (d > 0 ? Math.ceil(n / d) : 0);

/**
 * Compute every dashboard section for one week of day records at a chosen DPR.
 * `guarantee` is the stylist's guaranteed $/hr floor.
 */
export function computeWeek(days: DayRecord[], dpr: number, guarantee: number): WeekComputation {
  const { haircutPrice, colorPrice } = getActivePaymentLogic();

  // ── A. Metrics per DPR ────────────────────────────────────────────────
  const schedHrs = sum(days.map((d) => d.scheduledHours));
  const reqPph = pphForRate(dpr); // ceil(DPR / NP)
  const reqSvcRev = getRequiredProductionForPayRate(schedHrs, dpr); // reqPph × schedHrs
  const svcPayAtDpr = dpr * schedHrs;
  const metrics: DprMetrics = {
    dpr,
    schedHrs,
    reqSvcRev,
    reqPph,
    reqHaircuts: ceilDiv(reqSvcRev, haircutPrice),
    reqColors: ceilDiv(reqSvcRev, colorPrice),
    svcPayAtDpr,
  };

  // ── B. Recap (where you stand) ────────────────────────────────────────
  const hrsToDate = sum(days.map((d) => d.workedHours));
  const servicesToDate = sum(days.map((d) => d.production));
  const currPph = hrsToDate > 0 ? servicesToDate / hrsToDate : 0;
  const payRateAtPerf = getEffectiveRateFromPph(currPph, guarantee);
  const currHaircuts = sum(days.map((d) => d.haircuts));
  const currColors = sum(days.map((d) => d.colors));
  const recap: Recap = {
    payRateAtPerf,
    hrsToDate,
    servicesToDate,
    currPph,
    currHaircuts,
    currColors,
    potentialSvcPay: payRateAtPerf * hrsToDate,
  };

  // ── D. Daily breakdown (built before the Gap so the Gap can sum it) ────
  const daily: DailyRow[] = days.map((d) => {
    const scheduled = d.scheduledHours > 0;
    const goalRev = reqPph * d.scheduledHours;
    return {
      date: d.date,
      scheduled,
      actualRev: d.production,
      goalRev,
      actualHaircuts: d.haircuts,
      reqHaircuts: scheduled ? ceilDiv(goalRev, haircutPrice) : 0,
      actualColors: d.colors,
      reqColors: scheduled ? ceilDiv(goalRev, colorPrice) : 0,
      actualHrs: d.workedHours,
      schedHrs: d.scheduledHours,
      actualPph: d.workedHours > 0 ? Math.round(d.production / d.workedHours) : 0,
      reqPph: Math.round(reqPph),
    };
  });

  // ── C. Gap (Recap − Metrics). Service counts use the summed DAILY required
  //     counts, matching the spreadsheet's W7/X7 totals. ───────────────────
  const sumReqHaircutsDaily = sum(daily.map((r) => r.reqHaircuts));
  const sumReqColorsDaily = sum(daily.map((r) => r.reqColors));
  const gap: Gap = {
    payrate: payRateAtPerf - metrics.dpr,
    hrs: hrsToDate - schedHrs,
    svcRev: servicesToDate - reqSvcRev,
    pph: currPph - reqPph,
    haircuts: currHaircuts - sumReqHaircutsDaily,
    colors: currColors - sumReqColorsDaily,
    pay: recap.potentialSvcPay - svcPayAtDpr,
  };

  return { metrics, recap, gap, daily };
}

/** The selectable Desired Pay Rate options — the global tier table's pay rates. */
export function dprOptions(): number[] {
  return getActivePaymentLogic()
    .tiers.map((t) => t.payRate)
    .sort((a, b) => a - b);
}

/** A sensible default DPR: the lowest tier rate at least `guarantee + 4`. */
export function defaultDpr(guarantee: number): number {
  const opts = dprOptions();
  if (opts.length === 0) return Math.round(guarantee);
  return opts.find((o) => o >= guarantee + 4) ?? opts[opts.length - 1];
}

/**
 * Zero-dependency regression tests for the stylist-dashboard presentation model
 * (`src/lib/uatDashboard.ts`), asserting the EXACT values from the client's
 * UAT 2.xlsx "Holliean" tab / "For Developers 2026-07-29" PDF.
 *
 * Mirrors the pure composition in `uatDashboard.computeWeek` (which itself only
 * composes the tier engine). Run: node --test scripts/test-uat-dashboard.mjs
 *
 * ⚠️ Keep in sync with `src/lib/uatDashboard.ts` and `src/lib/tiers.ts`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const NP_RATE = 0.4;
const HAIRCUT_PRICE = 23;
const COLOR_PRICE = 85; // app default (admin-editable); UAT sheet used 80 for the weekly "Svcs Req" color count only.
const PPH_TIERS = [
  [8, 20], [9, 22.5], [10, 25], [11, 27.5], [12, 30], [13, 32.5], [14, 35],
  [15, 37.5], [16, 40], [17, 42.5], [18, 45], [19, 47.5], [20, 50],
].map(([payRate, pphRequired]) => ({ payRate, pphRequired }));

const pphForRate = (dpr) => Math.ceil(dpr / NP_RATE);
const ceilDiv = (n, d) => (d > 0 ? Math.ceil(n / d) : 0);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function effectiveRateFromPph(pph, guarantee) {
  if (pph < PPH_TIERS[0].pphRequired) return guarantee;
  let rate = PPH_TIERS[0].payRate;
  for (const t of PPH_TIERS) {
    if (t.pphRequired <= pph) rate = t.payRate;
    else break;
  }
  return Math.max(rate, guarantee);
}

function computeWeek(days, dpr, guarantee) {
  const schedHrs = sum(days.map((d) => d.scheduledHours));
  const reqPph = pphForRate(dpr);
  const reqSvcRev = reqPph * schedHrs;
  const metrics = {
    dpr,
    schedHrs,
    reqPph,
    reqSvcRev,
    svcPayAtDpr: dpr * schedHrs,
    reqHaircuts: ceilDiv(reqSvcRev, HAIRCUT_PRICE),
    reqColors: ceilDiv(reqSvcRev, COLOR_PRICE),
  };
  const hrsToDate = sum(days.map((d) => d.workedHours));
  const servicesToDate = sum(days.map((d) => d.production));
  const currPph = hrsToDate > 0 ? servicesToDate / hrsToDate : 0;
  const payRateAtPerf = effectiveRateFromPph(currPph, guarantee);
  const recap = {
    payRateAtPerf,
    hrsToDate,
    servicesToDate,
    currPph,
    currHaircuts: sum(days.map((d) => d.haircuts)),
    currColors: sum(days.map((d) => d.colors)),
    potentialSvcPay: payRateAtPerf * hrsToDate,
  };
  const daily = days.map((d) => {
    const scheduled = d.scheduledHours > 0;
    const goalRev = reqPph * d.scheduledHours;
    return {
      goalRev,
      reqHaircuts: scheduled ? ceilDiv(goalRev, HAIRCUT_PRICE) : 0,
      reqColors: scheduled ? ceilDiv(goalRev, COLOR_PRICE) : 0,
      actualPph: d.workedHours > 0 ? Math.round(d.production / d.workedHours) : 0,
      reqPph: Math.round(reqPph),
    };
  });
  const gap = {
    payrate: payRateAtPerf - metrics.dpr,
    hrs: hrsToDate - schedHrs,
    svcRev: servicesToDate - reqSvcRev,
    pph: currPph - reqPph,
    haircuts: recap.currHaircuts - sum(daily.map((r) => r.reqHaircuts)),
    colors: recap.currColors - sum(daily.map((r) => r.reqColors)),
    pay: recap.potentialSvcPay - metrics.svcPayAtDpr,
  };
  return { metrics, recap, gap, daily };
}

// Holliean, Week 1 (from the UAT sheet's "Data provided to App" rows).
const HOLLIEAN = [
  { scheduledHours: 5, workedHours: 4.03, production: 56.7, haircuts: 3, colors: 0 },
  { scheduledHours: 0, workedHours: 0, production: 0, haircuts: 0, colors: 0 },
  { scheduledHours: 5, workedHours: 6.13, production: 70, haircuts: 2, colors: 0 },
  { scheduledHours: 0, workedHours: 0, production: 0, haircuts: 0, colors: 0 },
  { scheduledHours: 5, workedHours: 6.03, production: 36, haircuts: 2, colors: 0 },
  { scheduledHours: 6, workedHours: 6.45, production: 148.7, haircuts: 6, colors: 0 },
  { scheduledHours: 0, workedHours: 0, production: 0, haircuts: 0, colors: 0 },
];

test("Section A — Metrics per DPR ($14): PPH 35, Req Svc Rev 735, Svc Pay 294", () => {
  const { metrics } = computeWeek(HOLLIEAN, 14, 10);
  assert.equal(metrics.schedHrs, 21);
  assert.equal(metrics.reqPph, 35);
  assert.equal(metrics.reqSvcRev, 735);
  assert.equal(metrics.svcPayAtDpr, 294);
  assert.equal(metrics.reqHaircuts, 32); // ceil(735/23)
});

test("DPR $19 → Req PPH 48 (ceil(47.5))", () => {
  assert.equal(computeWeek(HOLLIEAN, 19, 10).metrics.reqPph, 48);
});

test("Section B — Recap: pay rate at perf 10, hrs 22.64, svcs 311.4, PPH ~13.75", () => {
  const { recap } = computeWeek(HOLLIEAN, 14, 10);
  assert.equal(recap.payRateAtPerf, 10); // 13.75 PPH below lowest tier → guarantee
  assert.ok(Math.abs(recap.hrsToDate - 22.64) < 1e-9);
  assert.ok(Math.abs(recap.servicesToDate - 311.4) < 1e-9);
  assert.ok(Math.abs(recap.currPph - 13.7544) < 1e-3);
  assert.equal(recap.currHaircuts, 13);
  assert.equal(recap.currColors, 0);
  assert.ok(Math.abs(recap.potentialSvcPay - 226.4) < 1e-9);
});

test("Section C — Gap matches the sheet (payrate -4, svcs -21 haircuts & -12 colors)", () => {
  const { gap } = computeWeek(HOLLIEAN, 14, 10);
  assert.equal(gap.payrate, -4);
  assert.ok(Math.abs(gap.hrs - 1.64) < 1e-9);
  assert.ok(Math.abs(gap.svcRev + 423.6) < 1e-9);
  assert.ok(Math.abs(gap.pph + 21.2456) < 1e-3);
  assert.equal(gap.haircuts, -21); // 13 − 34 (summed daily required)
  assert.equal(gap.colors, -12); // 0 − 12
  assert.ok(Math.abs(gap.pay + 67.6) < 1e-9);
});

test("Daily — day 1 (Mon) & day 6 (Sat) PPH match ($14 vs $35, $23 vs $35)", () => {
  const { daily } = computeWeek(HOLLIEAN, 14, 10);
  assert.equal(daily[0].actualPph, 14);
  assert.equal(daily[0].reqPph, 35);
  assert.equal(daily[0].reqHaircuts, 8); // ceil(175/23)
  assert.equal(daily[0].reqColors, 3); // ceil(175/85)
  assert.equal(daily[5].actualPph, 23);
  assert.equal(daily[5].reqHaircuts, 10); // ceil(210/23)
});

/**
 * Zero-dependency regression tests for the tiered PPH pay math.
 *
 * Run with:  node --test scripts/test-team-calculations.mjs
 *
 * WHY A MIRROR: the repo keeps parallel pay-math implementations in agreement
 * (backend `pay_engine.py`, frontend `src/lib/tiers.ts`, docs `pay-plan-logic.md`).
 * This file mirrors the pure functions from `src/lib/tiers.ts` and asserts the
 * EXACT values from `docs/spec/PPH Based Payplan.xlsx` (sheets "Sched View" for
 * Rebeca and "Actual" for Steph). Uses Node's built-in test runner so no test
 * framework dependency is added (see docs/AGENTS.md — no heavyweight deps).
 *
 * ⚠️ If you change `src/lib/tiers.ts`, update this mirror in the same PR.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Mirror of src/lib/tiers.ts ────────────────────────────────────────────
const PPH_TIERS = [
  [11, 28], [12, 30], [13, 33], [14, 35], [15, 38], [16, 40], [17, 43],
  [18, 45], [19, 48], [20, 50], [21, 53], [22, 55], [23, 58], [24, 60],
  [25, 63], [26, 65], [27, 68], [28, 70], [29, 73],
].map(([payRate, pphRequired]) => ({ payRate, pphRequired }));
const NP_RATE = 0.4;
const HAIRCUT_PRICE = 23;
const COLOR_PRICE = 85;

function pphForRate(payRate) {
  const exact = PPH_TIERS.find((t) => t.payRate === payRate);
  return exact ? exact.pphRequired : payRate / NP_RATE;
}
function getRequiredProductionForPayRate(scheduledHours, rate) {
  return pphForRate(rate) * scheduledHours;
}
function minExpectedProduction(scheduledHours, guaranteeRate) {
  return (guaranteeRate / NP_RATE) * scheduledHours;
}
function getEffectiveRateFromPph(achievedPph, guaranteeRate, { interpolate = false, applyGuarantee = true } = {}) {
  const tiers = PPH_TIERS;
  if (achievedPph < tiers[0].pphRequired) return applyGuarantee ? guaranteeRate : 0;
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].pphRequired <= achievedPph) idx = i;
    else break;
  }
  const base = tiers[idx];
  let rate;
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
function getNextTier(currentPayRate) {
  return PPH_TIERS.find((t) => t.payRate > currentPayRate) ?? null;
}
function calculateOverShort(actual, required) {
  const productionDelta = actual - required;
  return { productionDelta, isOver: productionDelta >= 0 };
}
function productionToServices(production) {
  return {
    allHaircuts: Math.ceil(production / HAIRCUT_PRICE),
    allColors: Math.ceil(production / COLOR_PRICE),
  };
}

// ── Tests: Rebeca "Sched View" (guarantee 12, 27.25 scheduled hrs) ─────────
test("Rebeca — required weekly production matches col K", () => {
  const h = 27.25;
  assert.equal(getRequiredProductionForPayRate(h, 12), 817.5); // K10
  assert.equal(getRequiredProductionForPayRate(h, 13), 899.25); // K11
  assert.equal(getRequiredProductionForPayRate(h, 16), 1090); // K14
  assert.equal(getRequiredProductionForPayRate(h, 19), 1308); // K17
});

test("Rebeca — min expected production (cell N3 ≈ 818)", () => {
  assert.equal(minExpectedProduction(27.25, 12), 817.5);
});

// ── Tests: Steph "Actual" (guarantee 13, 28 scheduled hrs) ─────────────────
test("Steph — required weekly production matches col K", () => {
  const h = 28;
  assert.equal(getRequiredProductionForPayRate(h, 13), 924); // K11
  assert.equal(getRequiredProductionForPayRate(h, 14), 980); // K12
  assert.equal(getRequiredProductionForPayRate(h, 16), 1120); // K14
  assert.equal(getRequiredProductionForPayRate(h, 19), 1344); // K17
});

test("Steph — min expected production (cell N3 = 910)", () => {
  assert.equal(minExpectedProduction(28, 13), 910);
});

// ── Effective-rate tier lookup ─────────────────────────────────────────────
test("effective rate steps at tier PPH boundaries", () => {
  assert.equal(getEffectiveRateFromPph(32, 0, { applyGuarantee: false }), 12); // 32 < 33 → 12
  assert.equal(getEffectiveRateFromPph(33, 0, { applyGuarantee: false }), 13);
  assert.equal(getEffectiveRateFromPph(40, 0, { applyGuarantee: false }), 16);
  assert.equal(getEffectiveRateFromPph(47.9, 0, { applyGuarantee: false }), 18); // just under 48
  assert.equal(getEffectiveRateFromPph(48, 0, { applyGuarantee: false }), 19);
});

test("effective rate is floored at the guarantee", () => {
  assert.equal(getEffectiveRateFromPph(30, 13), 13); // tier 12 but guarantee 13
  assert.equal(getEffectiveRateFromPph(10, 14), 14); // below lowest tier → guarantee
});

test("effective rate interpolates when requested", () => {
  // Halfway between tier 12 (PPH 30) and 13 (PPH 33) → 12.5.
  assert.equal(getEffectiveRateFromPph(31.5, 0, { interpolate: true, applyGuarantee: false }), 12.5);
});

// ── getNextTier ────────────────────────────────────────────────────────────
test("getNextTier returns the next rate up, null at the top", () => {
  assert.deepEqual(getNextTier(19), { payRate: 20, pphRequired: 50 });
  assert.equal(getNextTier(29), null);
});

// ── Over/short + service conversions ($23 / $85) ───────────────────────────
test("over/short vs required", () => {
  assert.deepEqual(calculateOverShort(1000, 817.5), { productionDelta: 182.5, isOver: true });
  assert.equal(calculateOverShort(700, 817.5).isOver, false);
});

test("service conversions round up (workbook cells T6 / AC6)", () => {
  const s = productionToServices(817.5);
  assert.equal(s.allHaircuts, 36); // ceil(817.5 / 23)
  assert.equal(s.allColors, 10); // ceil(817.5 / 85)
});

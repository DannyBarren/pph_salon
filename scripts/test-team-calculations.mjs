/**
 * Zero-dependency regression tests for the tiered PPH pay math.
 *
 * Run with:  node --test scripts/test-team-calculations.mjs
 *
 * WHY A MIRROR: the repo keeps parallel pay-math implementations in agreement
 * (backend `pay_engine.py`, frontend `src/lib/tiers.ts`, docs `pay-plan-logic.md`).
 * This file mirrors the pure functions from `src/lib/tiers.ts` and asserts the
 * client's rules (UAT 2.xlsx "OtherData" tier table + the "Holliean" example).
 * Uses Node's built-in test runner so no test framework dependency is added.
 *
 * ⚠️ If you change `src/lib/tiers.ts`, update this mirror in the same PR.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Mirror of src/lib/tiers.ts (client's OtherData tier table) ─────────────
const PPH_TIERS = [
  [8, 20], [9, 22.5], [10, 25], [11, 27.5], [12, 30], [13, 32.5], [14, 35],
  [15, 37.5], [16, 40], [17, 42.5], [18, 45], [19, 47.5], [20, 50],
].map(([payRate, pphRequired]) => ({ payRate, pphRequired }));
const NP_RATE = 0.4;
const HAIRCUT_PRICE = 23;
const COLOR_PRICE = 85;

// Client rule: Required PPH = DPR / NP_RATE, rounded UP to the nearest dollar.
function pphForRate(payRate) {
  return Math.ceil(payRate / NP_RATE);
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

// ── Holliean example (guarantee $10, DPR $14, 21 scheduled hrs) ────────────
test("Holliean — required service revenue: DPR $14, 21h → $735 (PPH 35)", () => {
  assert.equal(pphForRate(14), 35); // ceil(14 / 0.40)
  assert.equal(getRequiredProductionForPayRate(21, 14), 735);
});

test("required PPH rounds up to the nearest dollar", () => {
  assert.equal(pphForRate(9), 23); // ceil(22.5)
  assert.equal(pphForRate(15), 38); // ceil(37.5)
  assert.equal(pphForRate(8), 20);
  assert.equal(pphForRate(20), 50);
});

test("Holliean — min expected production: (10 / 0.40) × 21 = 525", () => {
  assert.equal(minExpectedProduction(21, 10), 525);
});

// ── Effective-rate tier lookup (new client thresholds) ─────────────────────
test("effective rate steps at tier PPH boundaries", () => {
  assert.equal(getEffectiveRateFromPph(20, 0, { applyGuarantee: false }), 8);
  assert.equal(getEffectiveRateFromPph(34, 0, { applyGuarantee: false }), 13); // 32.5 ≤ 34 < 35
  assert.equal(getEffectiveRateFromPph(35, 0, { applyGuarantee: false }), 14);
  assert.equal(getEffectiveRateFromPph(49.9, 0, { applyGuarantee: false }), 19); // just under 50
  assert.equal(getEffectiveRateFromPph(50, 0, { applyGuarantee: false }), 20);
});

test("effective rate is floored at the guarantee", () => {
  assert.equal(getEffectiveRateFromPph(25, 12), 12); // tier 10 but guarantee 12
  assert.equal(getEffectiveRateFromPph(10, 14), 14); // below lowest tier → guarantee
});

test("effective rate interpolates when requested", () => {
  // Halfway between tier 12 (PPH 30) and 13 (PPH 32.5) → 12.5.
  assert.equal(getEffectiveRateFromPph(31.25, 0, { interpolate: true, applyGuarantee: false }), 12.5);
});

// ── getNextTier ────────────────────────────────────────────────────────────
test("getNextTier returns the next rate up, null at the top", () => {
  assert.deepEqual(getNextTier(19), { payRate: 20, pphRequired: 50 });
  assert.equal(getNextTier(20), null);
});

// ── Over/short + service conversions ($23 / $85) ───────────────────────────
test("over/short vs required", () => {
  assert.deepEqual(calculateOverShort(1000, 735), { productionDelta: 265, isOver: true });
  assert.equal(calculateOverShort(700, 735).isOver, false);
});

test("service conversions round up ($23 haircut / $85 color)", () => {
  const s = productionToServices(735);
  assert.equal(s.allHaircuts, 32); // ceil(735 / 23) = ceil(31.96)
  assert.equal(s.allColors, 9); // ceil(735 / 85) = ceil(8.65)
});

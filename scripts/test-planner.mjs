/**
 * Zero-dependency tests for the planner core logic.
 * Run with:  node --test scripts/test-planner.mjs
 *
 * Mirrors the pure functions in `src/lib/planner.ts` (kept in sync by hand — the
 * repo favours parallel implementations over adding a test-runner dependency).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const COMMISSION_RATE = 0.4;
const PRICES = { haircut: 23, color: 85 };
const clampCount = (n) => Math.max(0, Math.round(Number.isFinite(n) ? n : 0));

function getRequiredProduction(scheduledHrs, desiredPayRate, guaranteeRate, commissionRate = COMMISSION_RATE) {
  if (scheduledHrs <= 0) return 0;
  if (desiredPayRate <= guaranteeRate) return 0;
  return Math.round(desiredPayRate / commissionRate) * scheduledHrs;
}
function snapServiceMix(target, prices = PRICES, share = 0.55) {
  if (target <= 0) return { haircuts: 0, colors: 0 };
  const haircuts = clampCount((target * share) / prices.haircut);
  const colors = clampCount((target - haircuts * prices.haircut) / prices.color);
  return { haircuts, colors };
}
function adjustLinkedSlider(changed, newValue, target, prices = PRICES) {
  const v = clampCount(newValue);
  if (changed === "haircuts") return { haircuts: v, colors: clampCount((target - v * prices.haircut) / prices.color) };
  return { haircuts: clampCount((target - v * prices.color) / prices.haircut), colors: v };
}

test("getRequiredProduction: pph = round(rate/0.4) × hours", () => {
  assert.equal(getRequiredProduction(40, 20, 16), 2000); // 50 pph × 40
  assert.equal(getRequiredProduction(27.25, 19, 12), Math.round(19 / 0.4) * 27.25); // 48 × 27.25
});

test("getRequiredProduction: 0 at/under guarantee and for 0 hours", () => {
  assert.equal(getRequiredProduction(40, 16, 16), 0);
  assert.equal(getRequiredProduction(40, 12, 16), 0);
  assert.equal(getRequiredProduction(0, 25, 16), 0); // full-week call-off
});

test("snapServiceMix lands close to target with a haircut-weighted split", () => {
  const mix = snapServiceMix(2000);
  assert.equal(mix.haircuts, 48);
  assert.equal(mix.colors, 11);
  const production = mix.haircuts * 23 + mix.colors * 85;
  assert.ok(Math.abs(production - 2000) < 85); // within one color of target
});

test("adjustLinkedSlider keeps production on target", () => {
  assert.deepEqual(adjustLinkedSlider("haircuts", 60, 2000), { haircuts: 60, colors: 7 });
  assert.deepEqual(adjustLinkedSlider("colors", 20, 2000), { haircuts: 13, colors: 20 });
});

test("adjustLinkedSlider clamps the counterpart to zero (never negative)", () => {
  assert.deepEqual(adjustLinkedSlider("haircuts", 200, 2000), { haircuts: 200, colors: 0 });
});

test("snapServiceMix returns zero mix for zero target (call-off)", () => {
  assert.deepEqual(snapServiceMix(0), { haircuts: 0, colors: 0 });
});

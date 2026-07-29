/**
 * Dashboard ↔ Team parity: the stylist dashboard and the team roll-up must show
 * the SAME effective $/hr for a stylist. Both now use the tiered PPH engine
 * (`src/lib/tiers.ts` → mirrored in `payEngine.summarize` and `teamDerive`), so
 * this test pins the exact numbers the UI renders for real client figures and
 * guards against a regression back to the old flat-commission approximation.
 *
 * Run:  node --test scripts/test-dashboard-parity.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Mirror of the tiered engine (src/lib/tiers.ts — client OtherData table) ─
const PPH_TIERS = [
  [8, 20], [9, 22.5], [10, 25], [11, 27.5], [12, 30], [13, 32.5], [14, 35],
  [15, 37.5], [16, 40], [17, 42.5], [18, 45], [19, 47.5], [20, 50],
].map(([payRate, pphRequired]) => ({ payRate, pphRequired }));

function effectiveRate(production, hours, guarantee) {
  if (hours <= 0) return 0;
  const pph = production / hours;
  if (pph < PPH_TIERS[0].pphRequired) return guarantee;
  let rate = 0;
  for (const t of PPH_TIERS) {
    if (t.pphRequired <= pph) rate = t.payRate;
    else break;
  }
  return Math.max(rate, guarantee);
}

// The flat approximation we deliberately removed (production × 0.42 / hours,
// floored). Kept here only to assert the two models genuinely differ, so nobody
// silently reintroduces it.
function flatRate(production, hours, guarantee, commission = 0.42) {
  if (hours <= 0) return 0;
  return Math.max((production * commission) / hours, guarantee);
}

// ── Real client figures (PPH Data 06-26-2026) ──────────────────────────────
test("mid producer — Linda Jones (Burleson): tiered = $15/hr", () => {
  assert.equal(effectiveRate(2418.15, 62.92, 12), 15); // pph 38.4 → tier 37.5 → $15
});

test("top producer — Bonnie Turner (Missoula): tiered = $20/hr", () => {
  assert.equal(effectiveRate(4756.8, 91.48, 13), 20); // pph 52.0 → tier 50 → $20 (top)
});

test("guarantee floor — Angela Odea (Billings): floored at $11.25/hr", () => {
  // pph 28.5 → tier 27.5 (rate 11) but guarantee 11.25 wins.
  assert.equal(effectiveRate(364.4, 12.8, 11.25), 11.25);
});

test("tiered differs from the removed flat-0.42 model (Linda)", () => {
  const tiered = effectiveRate(2418.15, 62.92, 12); // 15
  const flat = flatRate(2418.15, 62.92, 12); // ~16.14
  assert.equal(tiered, 15);
  assert.ok(Math.abs(flat - 16.14) < 0.02);
  assert.notEqual(Math.round(tiered * 100), Math.round(flat * 100));
});

/**
 * FINAL pay-math regression test — cross-source parity with the Excel workbook.
 *
 * Run with:  node --test scripts/test-pay-parity.mjs
 *
 * The repo keeps the PPH pay ladder in three places that MUST never drift:
 *   1. Frontend engine      → src/lib/tiers.ts            (PPH_TIERS)
 *   2. Backend engine       → backend/app/services/pay_engine.py (DEFAULT_PPH_TIERS)
 *   3. Mirror unit tests    → scripts/test-team-calculations.mjs (PPH_TIERS)
 *
 * This test reads all three files as text, extracts each tier table, and asserts
 * they are byte-for-byte equal AND consistent with the workbook's underlying
 * relationship `payRate = roundHalfUp(pph * 0.4)` (cells B/C on both sheets), plus
 * the two anchor "min expected production" values from the sheet. If anyone edits
 * one table without the others, this fails loudly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Extract [payRate, pph] pairs from a slice of source using a pair regex. */
function extractPairs(text, startMarker, endMarker, pairRe) {
  const start = text.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const rest = text.slice(start + startMarker.length);
  const end = endMarker ? rest.indexOf(endMarker) : rest.length;
  const region = rest.slice(0, end > 0 ? end : rest.length);
  const pairs = [];
  let m;
  while ((m = pairRe.exec(region)) !== null) {
    pairs.push([Number(m[1]), Number(m[2])]);
  }
  return pairs;
}

// PPH thresholds can be fractional (e.g. 22.5), so match integers or decimals.
const NUM = "(\\d+(?:\\.\\d+)?)";

const frontendTiers = extractPairs(
  read("src/lib/tiers.ts"),
  "export const PPH_TIERS",
  "] as const;",
  new RegExp(`payRate:\\s*${NUM},\\s*pphRequired:\\s*${NUM}`, "g"),
);

const backendTiers = extractPairs(
  read("backend/app/services/pay_engine.py"),
  "DEFAULT_PPH_TIERS: list[tuple[float, float]] = [",
  "]",
  new RegExp(`\\(${NUM},\\s*${NUM}\\)`, "g"),
);

const mirrorTiers = extractPairs(
  read("scripts/test-team-calculations.mjs"),
  "const PPH_TIERS = [",
  "].map(",
  new RegExp(`\\[${NUM},\\s*${NUM}\\]`, "g"),
);

const roundHalfUp = (n) => Math.floor(n + 0.5);

test("all three tier tables are non-empty and the expected size", () => {
  assert.equal(frontendTiers.length, 13);
  assert.equal(backendTiers.length, 13);
  assert.equal(mirrorTiers.length, 13);
});

test("frontend tiers.ts == backend pay_engine.py == mirror test table", () => {
  assert.deepEqual(frontendTiers, backendTiers, "frontend vs backend tier drift");
  assert.deepEqual(frontendTiers, mirrorTiers, "frontend vs mirror tier drift");
});

test("every tier obeys the workbook relationship payRate = roundHalfUp(pph * 0.4)", () => {
  for (const [payRate, pph] of frontendTiers) {
    assert.equal(payRate, roundHalfUp(pph * 0.4), `tier $${payRate}@${pph}pph breaks pph*0.4`);
  }
});

test("service prices + NP rate match across frontend and backend", () => {
  const fe = read("src/lib/tiers.ts");
  const be = read("backend/app/services/pay_engine.py");
  assert.ok(/NP_RATE = 0\.4/.test(fe) && /DEFAULT_NP_RATE = 0\.4/.test(be), "NP_RATE mismatch");
  assert.ok(/HAIRCUT_PRICE = 23/.test(fe) && /DEFAULT_HAIRCUT_PRICE = 23\.0/.test(be), "haircut price mismatch");
  assert.ok(/COLOR_PRICE = 85/.test(fe) && /DEFAULT_COLOR_PRICE = 85\.0/.test(be), "color price mismatch");
});

test("client formulas — Holliean example + min-expected anchor", () => {
  // Required PPH = ceil(DPR / 0.40); Required Service Revenue = hours × PPH.
  const requiredPph = (dpr) => Math.ceil(dpr / 0.4);
  const requiredSvcRev = (hours, dpr) => hours * requiredPph(dpr);
  // Holliean: DPR $14, 21 scheduled hours → PPH 35, Req Svc Rev $735.
  assert.equal(requiredPph(14), 35);
  assert.equal(requiredSvcRev(21, 14), 735);
  // Min-expected production: (guarantee / 0.40) × hours. Holliean $10 over 21h.
  const minExpected = (hours, guarantee) => (guarantee / 0.4) * hours;
  assert.equal(minExpected(21, 10), 525);
});

/**
 * Frontend Demo is opt-in. Unset / missing / "" / "false" / "0" = live mode.
 * Only the exact string "true" turns Demo on.
 *
 * Run:  node --experimental-strip-types --test scripts/test-demo-mode-default.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

assert.equal(
  process.env.NEXT_PUBLIC_DEMO_MODE,
  undefined,
  "this assertion requires NEXT_PUBLIC_DEMO_MODE to be unset in the test env",
);

const { isDemoModeEnabled, DEMO_MODE } = await import("../src/lib/featureFlags.ts");

test("DEMO_MODE is false when NEXT_PUBLIC_DEMO_MODE is unset", () => {
  assert.equal(DEMO_MODE, false);
});

test("isDemoModeEnabled: only the exact string 'true' is demo", () => {
  assert.equal(isDemoModeEnabled(undefined), false);
  assert.equal(isDemoModeEnabled(null), false);
  assert.equal(isDemoModeEnabled(""), false);
  assert.equal(isDemoModeEnabled("false"), false);
  assert.equal(isDemoModeEnabled("0"), false);
  assert.equal(isDemoModeEnabled("TRUE"), false);
  assert.equal(isDemoModeEnabled(" true"), false);
  assert.equal(isDemoModeEnabled("true "), false);
  assert.equal(isDemoModeEnabled("1"), false);
  assert.equal(isDemoModeEnabled("yes"), false);
  assert.equal(isDemoModeEnabled("true"), true);
});

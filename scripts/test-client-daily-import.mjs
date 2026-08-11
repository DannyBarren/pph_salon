/**
 * The client's real daily export must import — and produce the right metrics.
 *
 * Unlike the other scripts in here this one runs the APP'S OWN modules (the
 * xlsx reader, the daily parser and the pay engine), so it fails if the import
 * path drifts away from the file the client actually sends:
 *
 *   v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx
 *     employee_id | salon_name | week_start/sale_date | scheduled_hrs |
 *     actual_hrs | actual_haircuts | actual_colors |
 *     actual_other_value/service_revenue | Employee Name | pay_period |
 *     Include/Exclude
 *
 * Every expectation is computed straight from the spreadsheet rows, so the
 * parser is checked against the file rather than against itself.
 *
 * Run:  node --experimental-strip-types --test scripts/test-client-daily-import.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./ts-loader.mjs", import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKBOOK = join(ROOT, "v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx");
const PAY_PERIOD_WEEKS = ["2026-06-22", "2026-06-29"];

const { readXlsxSheet, sheetToCsv } = await import("../src/lib/xlsx.ts");
const { looksLikeDailyImport, parseDailyBulk, dailyRowsToWeeks } = await import("../src/lib/demoImport.ts");
const { summarize } = await import("../src/lib/payEngine.ts");
const { getCurrentEffectivePayRate, HAIRCUT_PRICE, COLOR_PRICE } = await import("../src/lib/tiers.ts");
const { DEFAULT_CONFIG, resolveRosterUserId, userById } = await import("../src/lib/mockData.ts");

const skip = existsSync(WORKBOOK) ? false : "client workbook not in the repo";

/** Read the workbook the way the browser upload does: unzip → CSV text. */
async function readWorkbookCsv() {
  const buf = readFileSync(WORKBOOK);
  const sheet = await readXlsxSheet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { sheet, csv: sheetToCsv(sheet) };
}

function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function isoOfUsDate(us) {
  const [m, d, y] = us.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Per (employee code, week) totals read directly out of the spreadsheet. */
function expectedTotals(sheet) {
  const totals = new Map();
  for (const row of sheet.rows) {
    const [code, , saleDate, sched, hours, cuts, colors, revenue] = row;
    if (!code) continue;
    const key = `${code}|${mondayOf(isoOfUsDate(saleDate))}`;
    const t = totals.get(key) ?? { scheduled: 0, hours: 0, cuts: 0, colors: 0, revenue: 0, days: 0 };
    t.scheduled += Number(sched || 0);
    t.hours += Number(hours || 0);
    t.cuts += Number(cuts || 0);
    t.colors += Number(colors || 0);
    t.revenue += Number(revenue || 0);
    t.days += 1;
    totals.set(key, t);
  }
  return totals;
}

const close = (a, b, tolerance = 0.011) => Math.abs(a - b) <= tolerance;

test("the workbook is recognised as a daily export", { skip }, async () => {
  const { sheet, csv } = await readWorkbookCsv();
  assert.deepEqual(sheet.headers, [
    "employee_id", "salon_name", "week_start\r\nsale_date", "scheduled_hrs",
    "actual_hrs", "actual_haircuts", "actual_colors",
    "actual_other_value\r\nservice_revenue", "Employee Name", "pay_period",
    "Include/Exclude",
  ]);
  assert.ok(looksLikeDailyImport(csv), "headers should route the file to the daily parser");
});

test("every row lands, and unknown employees are named", { skip }, async () => {
  const { sheet, csv } = await readWorkbookCsv();
  const parsed = parseDailyBulk(csv);

  assert.equal(parsed.rows.length + parsed.skipped, sheet.rows.length);
  // The only rows a full roster cannot take are employees hired after the
  // roster export — every error must say who, so they can be added.
  for (const err of parsed.errors) {
    assert.match(err, /unknown employee_id "VG-\d+" \(.+\)/);
  }
  const unknown = new Set(sheet.rows.map((r) => r[0]).filter((c) => !resolveRosterUserId(c)));
  assert.equal(parsed.skipped, sheet.rows.filter((r) => unknown.has(r[0])).length);
});

test("daily rows rebuild whole weeks that tie out to the spreadsheet", { skip }, async () => {
  const { sheet, csv } = await readWorkbookCsv();
  const weeks = dailyRowsToWeeks(parseDailyBulk(csv).rows);
  const totals = expectedTotals(sheet);

  assert.deepEqual([...new Set(weeks.map((w) => w.weekStart))].sort(), PAY_PERIOD_WEEKS);

  let checked = 0;
  for (const [key, want] of totals) {
    const [code, weekStart] = key.split("|");
    const userId = resolveRosterUserId(code);
    if (!userId) continue; // not on the roster — already asserted as skipped
    const week = weeks.find((w) => w.userId === userId && w.weekStart === weekStart);
    assert.ok(week, `missing week ${weekStart} for ${code}`);
    assert.equal(week.days.length, 7, "a week is always a full Mon–Sun");
    assert.ok(close(week.scheduledHrs, want.scheduled), `${code} ${weekStart} scheduled hours`);
    assert.ok(close(week.actualHrs, want.hours), `${code} ${weekStart} worked hours`);
    assert.equal(week.haircuts, want.cuts);
    assert.equal(week.colors, want.colors);
    // service_revenue is the production, not haircuts × price + colors × price.
    assert.ok(close(week.production, want.revenue), `${code} ${weekStart} production`);
    checked += 1;
  }
  assert.ok(checked > 90, `expected ~100 employee-weeks, checked ${checked}`);
});

test("service_revenue is never re-derived from the haircut/color counts", { skip }, async () => {
  const { sheet, csv } = await readWorkbookCsv();
  const weeks = dailyRowsToWeeks(parseDailyBulk(csv).rows);
  const totals = expectedTotals(sheet);

  // Roughly half of this pay period's weeks earn LESS than the count-based
  // model would suggest, so the two are genuinely distinguishable.
  let differ = 0;
  for (const [, want] of totals) {
    if (!close(want.revenue, want.cuts * HAIRCUT_PRICE + want.colors * COLOR_PRICE)) differ += 1;
  }
  assert.ok(differ > 50, `expected the models to differ widely, they differed ${differ} times`);

  const revenueTotal = [...totals.values()].reduce((a, t) => a + t.revenue, 0);
  const importedTotal = weeks.reduce((a, w) => a + w.production, 0);
  const missing = [...totals.entries()]
    .filter(([key]) => !resolveRosterUserId(key.split("|")[0]))
    .reduce((a, [, t]) => a + t.revenue, 0);
  assert.ok(close(importedTotal, revenueTotal - missing, 0.5));
});

test("dashboard metrics for the imported weeks match the spreadsheet", { skip }, async () => {
  const { sheet, csv } = await readWorkbookCsv();
  const weeks = dailyRowsToWeeks(parseDailyBulk(csv).rows);
  const totals = expectedTotals(sheet);

  for (const week of weeks) {
    const user = userById(week.userId);
    const code = [...totals.keys()]
      .map((k) => k.split("|"))
      .find(([c, ws]) => resolveRosterUserId(c) === week.userId && ws === week.weekStart)[0];
    const want = totals.get(`${code}|${week.weekStart}`);
    const guarantee = user.guaranteeRate ?? DEFAULT_CONFIG.guaranteeRate;

    const summary = summarize(week.days, user.salonId, DEFAULT_CONFIG, guarantee);
    assert.ok(close(summary.productionToDate, want.revenue), `production for ${code} ${week.weekStart}`);
    assert.ok(close(summary.workedHours, want.hours), `worked hours for ${code} ${week.weekStart}`);
    assert.equal(summary.haircuts, want.cuts);
    assert.equal(summary.colors, want.colors);

    // PPH and the tiered $/hr follow from those two numbers alone.
    const pph = want.hours > 0 ? want.revenue / want.hours : 0;
    const expectedRate = getCurrentEffectivePayRate(want.revenue, want.hours, guarantee);
    assert.ok(close(summary.effectiveRate, expectedRate), `effective rate for ${code} ${week.weekStart}`);
    assert.ok(close(summary.pay, expectedRate * want.hours, 0.02), `pay for ${code} ${week.weekStart}`);
    // Nobody is ever paid below their guarantee floor — including the weeks
    // that were worked with no service revenue at all (pph 0).
    if (want.hours > 0) {
      assert.ok(Number.isFinite(pph) && pph >= 0);
      assert.ok(summary.effectiveRate >= guarantee - 0.001);
    }
  }
});

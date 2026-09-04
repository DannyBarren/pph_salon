/**
 * Shared parser for the demo playground's BULK pay-period import.
 *
 * Handles both shapes the client sends:
 *
 * * **Weekly** — our bulk template, one row per employee per week.
 * * **Daily** — their real pay-period export, one row per employee per work day
 *   (`employee_id, salon_name, sale_date, scheduled_hrs, actual_hrs,
 *   actual_haircuts, actual_colors, service_revenue, Employee Name, pay_period,
 *   Include/Exclude`). `service_revenue` IS the day's production — it is never
 *   re-derived from haircuts × price + colors × price.
 *
 * Either way each row is routed to a stylist by `employee_id` (the client
 * Employee code like `VG1426`/`VG-1426`, or our user id) — the `salon_name`
 * column is just a label and is NOT used for routing, mirroring the live
 * `/admin/import-weekly` and `/admin/import-daily` behaviour. This keeps the
 * offline demo consistent with the real backend import.
 */

import { parseCsv } from "./csv";
import { resolveRosterUserId } from "./mockData";
import { addDays, mondayOf } from "./time";
import { HAIRCUT_PRICE, COLOR_PRICE } from "./tiers";
import type { DayRecord } from "./types";

export interface WeeklyBulkRow {
  /** Resolved demo user id (e.g. "u2"). */
  userId: string;
  /** The employee_id exactly as given (Employee code or user id). */
  employeeId: string;
  salonName: string;
  weekStart: string;
  scheduledHrs: number;
  actualHrs: number;
  actualHaircuts: number;
  actualColors: number;
  actualOtherValue: number;
  notes?: string;
}

export interface WeeklyBulkParse {
  rows: WeeklyBulkRow[];
  skipped: number;
  errors: string[];
}

/** One row of the client's daily export — a single work day for one employee. */
export interface DailyBulkRow {
  /** Resolved demo user id (e.g. "u2"). */
  userId: string;
  /** The employee_id exactly as given (`VG-1426` / `VG1426` / a user id). */
  employeeId: string;
  salonName: string;
  /** ISO work date (yyyy-mm-dd). */
  date: string;
  scheduledHours: number;
  workedHours: number;
  haircuts: number;
  colors: number;
  /** Authoritative daily service revenue from the file. */
  production: number;
  /** Include/Exclude — true when the employee is off the PPH pay plan. */
  excluded?: boolean;
  /** The file's own pay-period label, e.g. "06-22-2026 to 07-05-2026". */
  payPeriod?: string;
}

export interface DailyBulkParse {
  rows: DailyBulkRow[];
  skipped: number;
  errors: string[];
}

/** A week rebuilt from daily rows: 7 day records whose sums are the file's. */
export interface DailyBulkWeek {
  userId: string;
  weekStart: string;
  /** Full Mon–Sun week; days absent from the file are zeroed (days off). */
  days: DayRecord[];
  scheduledHrs: number;
  actualHrs: number;
  haircuts: number;
  colors: number;
  production: number;
}

const WORKING_DAYS = 6; // Mon–Sat

function spread(total: number, n: number): number[] {
  return Array.from({ length: n }, () => total / n);
}
function spreadInt(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

/**
 * Comparable tokens for one header cell. The client's export puts two accepted
 * names in a single cell (`week_start` above `sale_date`), so a cell matches if
 * ANY of its lines does.
 */
function headerTokens(header: string): string[] {
  return (header ?? "")
    .split(/[\r\n]+/)
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((h) => headerTokens(h).some((t) => names.includes(t)));
}

const num = (v: string) => {
  const n = parseFloat((v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

/** Parse the bulk weekly template, routing each row to a user by employee_id. */
export function parseWeeklyBulk(text: string): WeeklyBulkParse {
  const parsed = parseCsv(text);
  const find = (...names: string[]) => findColumn(parsed.headers, names);
  const col = {
    employee: find("employeeid", "employeecode", "eeid", "empid", "userid", "user"),
    salon: find("salonname", "salon", "salonlocation", "location", "center"),
    week: find("weekstart", "week", "date", "periodstart"),
    sched: find("scheduledhrs", "scheduledhours", "schedhrs", "scheduled"),
    actual: find("actualhrs", "actualhours", "hoursworked", "worked"),
    cuts: find("actualhaircuts", "haircuts", "cuts"),
    colors: find("actualcolors", "colors"),
    other: find("actualothervalue", "netservicerev", "othervalue", "production", "svcrev"),
    notes: find("notes", "comment"),
  };

  const out: WeeklyBulkParse = { rows: [], skipped: 0, errors: [] };
  parsed.rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const ident = cell(row, col.employee);
    const weekStart = cell(row, col.week).slice(0, 10);
    // Silently skip genuinely blank rows.
    if (!ident && !weekStart) return;
    if (!ident) {
      out.skipped += 1;
      out.errors.push(`Row ${line}: employee_id is required`);
      return;
    }
    const userId = resolveRosterUserId(ident, cell(row, col.salon));
    if (!userId) {
      out.skipped += 1;
      out.errors.push(`Row ${line}: unknown employee_id "${ident}"`);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      out.skipped += 1;
      out.errors.push(`Row ${line}: invalid week_start "${weekStart}" (use YYYY-MM-DD)`);
      return;
    }
    out.rows.push({
      userId,
      employeeId: ident,
      salonName: cell(row, col.salon),
      weekStart,
      scheduledHrs: num(cell(row, col.sched)),
      actualHrs: num(cell(row, col.actual)),
      actualHaircuts: Math.round(num(cell(row, col.cuts))),
      actualColors: Math.round(num(cell(row, col.colors))),
      actualOtherValue: num(cell(row, col.other)),
      notes: cell(row, col.notes) || undefined,
    });
  });
  return out;
}

/* ─────────────────────────── Daily export ─────────────────────────── */

// Header tokens that only ever appear in a DAILY export, never in the weekly
// template — used to pick the right parser for an uploaded file.
const DAILY_MARKERS = [
  "saledate", "workdate", "servicerevenue", "servicesale", "includeexclude",
  "payperiod", "actsvcrev", "actcutscount", "actcolorscount", "eename",
];

/** True when the file is the client's per-day export rather than weekly rows. */
export function looksLikeDailyImport(text: string): boolean {
  const { headers } = parseCsv(text);
  return headers.some((h) => headerTokens(h).some((t) => DAILY_MARKERS.includes(t)));
}

/** Accept ISO (2026-06-22) and US M/D/YYYY (6/22/2026) dates, as the files do. */
function toIsoDate(value: string): string | null {
  const s = (value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (!us) return null;
  const [, m, d, y] = us;
  const year = y.length === 2 ? `20${y}` : y.padStart(4, "0");
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Parse the client's daily export (v2 template, their raw per-day export, or the
 * older "Data provided to App" layout), routing each row by employee_id.
 */
export function parseDailyBulk(text: string): DailyBulkParse {
  const parsed = parseCsv(text);
  const find = (...names: string[]) => findColumn(parsed.headers, names);
  const col = {
    employee: find("employeeid", "employeecode", "eeid", "empid", "userid", "user"),
    name: find("employeename", "eename", "name"),
    salon: find("salonname", "salon", "salonlocation", "location", "center"),
    date: find("saledate", "date", "workdate", "weekstart"),
    sched: find("scheduledhrs", "scheduledhours", "schedhrs", "scheduled"),
    actual: find("actualhrs", "actualhours", "hoursworked", "worked"),
    cuts: find("actualhaircuts", "haircuts", "haircut", "actcutscount", "cuts"),
    colors: find("actualcolors", "colors", "color", "actcolorscount"),
    revenue: find("servicerevenue", "servicesale", "actsvcrev", "svcrev", "netservicerev"),
    other: find("actualothervalue", "othervalue"),
    excluded: find("includeexclude", "excl", "excluded", "exclude"),
    period: find("payperiod", "period"),
  };
  // In the v2 file one header cell carries both names, so `other` and `revenue`
  // can resolve to the SAME column — it is service revenue, not an addition.
  const otherCol = col.other === col.revenue ? -1 : col.other;

  const out: DailyBulkParse = { rows: [], skipped: 0, errors: [] };
  parsed.rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const ident = cell(row, col.employee);
    const rawDate = cell(row, col.date);
    // Silently skip genuinely blank rows.
    if (!ident && !rawDate) return;
    if (!ident) {
      out.skipped += 1;
      out.errors.push(`Row ${line}: employee_id is required`);
      return;
    }
    const userId = resolveRosterUserId(ident, cell(row, col.salon));
    if (!userId) {
      // Name the person too — an unknown code is almost always a new hire who
      // is not on the roster yet, and the client needs to know who to add.
      const who = cell(row, col.name);
      out.skipped += 1;
      out.errors.push(`Row ${line}: unknown employee_id "${ident}"${who ? ` (${who})` : ""}`);
      return;
    }
    const date = toIsoDate(rawDate);
    if (!date) {
      out.skipped += 1;
      out.errors.push(`Row ${line}: invalid sale_date "${rawDate}" (use YYYY-MM-DD or M/D/YYYY)`);
      return;
    }

    const haircuts = Math.round(num(cell(row, col.cuts)));
    const colors = Math.round(num(cell(row, col.colors)));
    // service_revenue is authoritative; only fall back to the derived model for
    // older files that carry no revenue column at all.
    const production =
      col.revenue >= 0
        ? num(cell(row, col.revenue))
        : haircuts * HAIRCUT_PRICE + colors * COLOR_PRICE + num(cell(row, otherCol));
    const flag = cell(row, col.excluded).toLowerCase();

    out.rows.push({
      userId,
      employeeId: ident,
      salonName: cell(row, col.salon),
      date,
      scheduledHours: num(cell(row, col.sched)),
      workedHours: num(cell(row, col.actual)),
      haircuts,
      colors,
      production,
      excluded: flag ? ["exclude", "excluded", "y", "yes", "true", "1"].includes(flag) : undefined,
      payPeriod: cell(row, col.period) || undefined,
    });
  });
  return out;
}

/**
 * Group daily rows into whole weeks per employee. Every week is emitted as a
 * full Mon–Sun set of day records (days missing from the file are days off), so
 * the imported week replaces any demo baseline outright and its totals equal
 * the file exactly.
 */
export function dailyRowsToWeeks(rows: DailyBulkRow[]): DailyBulkWeek[] {
  const byWeek = new Map<string, DailyBulkRow[]>();
  for (const r of rows) {
    const key = `${r.userId}|${mondayOf(r.date)}`;
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(r);
    else byWeek.set(key, [r]);
  }

  const round2 = (x: number) => Math.round(x * 100) / 100;
  return Array.from(byWeek, ([key, group]) => {
    const [userId, weekStart] = key.split("|");
    // Later rows for the same day win, mirroring the backend's daily upsert.
    const byDate = new Map(group.map((r) => [r.date, r]));
    const days: DayRecord[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const r = byDate.get(date);
      return {
        date,
        scheduledHours: r ? r.scheduledHours : 0,
        workedHours: r ? r.workedHours : 0,
        haircuts: r ? r.haircuts : 0,
        colors: r ? r.colors : 0,
        production: r ? r.production : 0,
      };
    });
    const sum = (pick: (d: DayRecord) => number) => days.reduce((a, d) => a + pick(d), 0);
    return {
      userId,
      weekStart,
      days,
      scheduledHrs: round2(sum((d) => d.scheduledHours)),
      actualHrs: round2(sum((d) => d.workedHours)),
      haircuts: sum((d) => d.haircuts),
      colors: sum((d) => d.colors),
      production: round2(sum((d) => d.production)),
    };
  });
}

/** Spread a weekly bulk row into 7 day records (Mon–Sat worked, Sun off). */
export function weeklyRowToDays(r: WeeklyBulkRow): DayRecord[] {
  const production = r.actualHaircuts * HAIRCUT_PRICE + r.actualColors * COLOR_PRICE + r.actualOtherValue;
  const sched = spread(r.scheduledHrs, WORKING_DAYS);
  const worked = spread(r.actualHrs, WORKING_DAYS);
  const prod = spread(production, WORKING_DAYS);
  const cuts = spreadInt(r.actualHaircuts, WORKING_DAYS);
  const cols = spreadInt(r.actualColors, WORKING_DAYS);
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const days: DayRecord[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(r.weekStart, i);
    if (i >= WORKING_DAYS) {
      days.push({ date, scheduledHours: 0, workedHours: 0, haircuts: 0, colors: 0, production: 0 });
      continue;
    }
    days.push({
      date,
      scheduledHours: round2(sched[i]),
      workedHours: round2(worked[i]),
      haircuts: cuts[i],
      colors: cols[i],
      production: round2(prod[i]),
    });
  }
  return days;
}

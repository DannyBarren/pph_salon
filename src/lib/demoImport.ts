/**
 * Shared parser for the demo playground's BULK pay-period import.
 *
 * One file can carry many employees across many weeks / pay periods. Each row is
 * routed to a stylist by `employee_id` (the client Employee code like `VG1426`,
 * or our user id) — the `salon_name` column is just a label and is NOT used for
 * routing, mirroring the live `/admin/import-weekly` behaviour. This keeps the
 * offline demo consistent with the real backend import.
 */

import { parseCsv } from "./csv";
import { resolveRosterUserId } from "./mockData";
import { addDays } from "./time";
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

const WORKING_DAYS = 6; // Mon–Sat

function spread(total: number, n: number): number[] {
  return Array.from({ length: n }, () => total / n);
}
function spreadInt(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

/** Parse the bulk weekly template, routing each row to a user by employee_id. */
export function parseWeeklyBulk(text: string): WeeklyBulkParse {
  const parsed = parseCsv(text);
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const find = (...names: string[]) => parsed.headers.findIndex((h) => names.includes(norm(h)));
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
  const num = (v: string) => {
    const n = parseFloat((v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

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
    const userId = resolveRosterUserId(ident);
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

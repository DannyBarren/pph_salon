import type { Week } from "./types";

/**
 * Fixed "today" so the prototype is fully deterministic (no hydration drift).
 * Anchored inside the client's real pay period (2026-06-22 → 07-05) and mid-week
 * (Wed of the 06-29 week), so the current pay period pairs weeks 06-22 + 06-29 —
 * exactly the weeks the client's real DAILY export covers — while still leaving
 * completed AND upcoming days so the planner's "what you still need" is meaningful.
 */
export const TODAY = "2026-07-01"; // a Wednesday, inside the 06-22 → 07-05 pay period

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_BACK = 7; // number of prior weeks generated before the current week (8 weeks / 4 pay periods)

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoOf(new Date(toUTC(iso).getTime() + days * DAY_MS));
}

/** Monday-based weekday index: Mon=0 ... Sun=6. */
export function weekdayIndex(iso: string): number {
  const js = toUTC(iso).getUTCDay(); // Sun=0..Sat=6
  return (js + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function fmtShort(iso: string): string {
  const d = toUTC(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtShort(startIso)} – ${fmtShort(endIso)}`;
}

/** Build the deterministic list of weeks, oldest first, current week last. */
export function buildWeeks(): Week[] {
  const currentMonday = mondayOf(TODAY);
  const weeks: Week[] = [];
  for (let i = WEEKS_BACK; i >= 0; i--) {
    const start = addDays(currentMonday, -i * 7);
    const end = addDays(start, 6);
    const order = WEEKS_BACK - i; // 0 = oldest
    weeks.push({
      id: start,
      start,
      end,
      label: fmtRange(start, end),
      periodIndex: Math.floor(order / 2),
    });
  }
  return weeks;
}

export const WEEKS = buildWeeks();
export const CURRENT_WEEK = WEEKS[WEEKS.length - 1];

/** All weeks in a given pay period, oldest first. */
export function weeksInPeriod(periodIndex: number): Week[] {
  return WEEKS.filter((w) => w.periodIndex === periodIndex);
}

export function weekById(id: string): Week {
  return WEEKS.find((w) => w.id === id) ?? CURRENT_WEEK;
}

export function isFuture(iso: string): boolean {
  return iso > TODAY;
}

export function isToday(iso: string): boolean {
  return iso === TODAY;
}

export function daysOfWeek(week: Week): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
}

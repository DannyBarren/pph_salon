import type { StylistDayRecord, StylistWeekRecord, TeamDataPayload } from "./teamTypes";
import { v, safeParse } from "./validate";
import { STYLIST_DATA, USERS, salonById } from "./mockData";
import { CLIENT_ROSTER, CLIENT_WEEK_START, CLIENT_WEEK_END } from "./clientRoster";

/**
 * Team Dashboard seed data — derived from the client's REAL export via the same
 * mock dataset the rest of the demo uses (`mockData.STYLIST_DATA`), so a
 * stylist's numbers are identical whether viewed on their own dashboard or in
 * the team roll-up. Every salon + employee from the export is included so the
 * client POC can browse and verify the whole organisation without credentials.
 */

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

/** The dashboard's current week (the client export's pay week). */
export const TEAM_WEEK = {
  start: CLIENT_WEEK_START,
  end: CLIENT_WEEK_END,
  label: `${shortDate(CLIENT_WEEK_START)} – ${shortDate(CLIENT_WEEK_END)}`,
} as const;

/**
 * "Today" for the team view — the day AFTER the export week, so every working
 * day counts as completed and the roll-up shows the real full-week figures.
 */
export const TEAM_TODAY = "2026-06-29";

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const EMPLOYEE_CODE_BY_ID = new Map(CLIENT_ROSTER.map((p) => [p.id, p.employeeCode]));

/** Zod-lite schema mirroring `StylistWeekRecord`, used to validate the payload. */
const daySchema = v.object<StylistDayRecord>({
  date: v.string(),
  label: v.string(),
  scheduledHours: v.number({ min: 0 }),
  actualHours: v.number({ min: 0 }),
  production: v.number({ min: 0 }),
  haircuts: v.number({ min: 0 }),
  colors: v.number({ min: 0 }),
});

export const stylistWeekSchema = v.object<StylistWeekRecord>({
  id: v.string(),
  stylistId: v.string(),
  name: v.string(),
  title: v.string(),
  salonId: v.string(),
  hue: v.number({ min: 0, max: 360 }),
  guaranteeRate: v.number({ min: 0 }),
  weekStart: v.string(),
  weekEnd: v.string(),
  weekLabel: v.string(),
  days: v.array(daySchema),
});

function buildRecords(): StylistWeekRecord[] {
  const records: StylistWeekRecord[] = [];
  for (const u of USERS) {
    const data = STYLIST_DATA[u.id];
    if (!data) continue; // owner/SDL has no personal performance record
    const days: StylistDayRecord[] = data.days.map((d, i) => ({
      date: d.date,
      label: DAY_LABELS[i] ?? "",
      scheduledHours: d.scheduledHours,
      actualHours: d.workedHours,
      production: d.production,
      haircuts: d.haircuts,
      colors: d.colors,
    }));
    records.push({
      id: u.id,
      stylistId: EMPLOYEE_CODE_BY_ID.get(u.id) ?? u.id,
      name: u.name,
      title: u.title,
      salonId: u.salonId,
      hue: u.hue,
      guaranteeRate: u.guaranteeRate ?? salonById(u.salonId).guaranteeRate ?? 12,
      weekStart: TEAM_WEEK.start,
      weekEnd: TEAM_WEEK.end,
      weekLabel: TEAM_WEEK.label,
      days,
    });
  }
  return records;
}

/**
 * Return the raw team payload, validated. Any record that fails validation is
 * dropped (and reported) rather than crashing the dashboard.
 */
export function getTeamPayload(): TeamDataPayload {
  const raw = buildRecords();
  const records: StylistWeekRecord[] = [];
  for (const r of raw) {
    const parsed = safeParse(stylistWeekSchema, r);
    if (parsed.success) {
      records.push(parsed.data);
    } else if (typeof console !== "undefined") {
      console.warn(`[teamData] dropping invalid record "${r.id}"`, parsed.issues);
    }
  }
  return { records, generatedAt: new Date().toISOString(), source: "mock" };
}

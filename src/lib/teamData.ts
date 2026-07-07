import { HAIRCUT_PRICE, COLOR_PRICE } from "./tiers";
import type { StylistDayRecord, StylistWeekRecord, TeamDataPayload } from "./teamTypes";
import { v, safeParse } from "./validate";

/**
 * Seed data for the Team Dashboard.
 *
 * Two records are pulled verbatim from `docs/spec/PPH Based Payplan.xlsx`:
 *   • **Rebeca 18939** — "Sched View" sheet (guarantee $12, 27.25 scheduled hrs,
 *     daily Mo 5.25 / Tu 6.25 / We 5.25 / Th 5.25 / Fr 5.25).
 *   • **Steph 11027** — "Actual" sheet (guarantee $13, 28 scheduled hrs, daily
 *     Mo 3 / Tu 5 / We 4 / Th 4 / Fr 6 / Sa 6). Steph's prior-week actual of
 *     $1,086 (cell E30, week 6/1–6/7) informs her production profile here.
 *
 * Six additional stylists are modelled with realistic, varied data that follows
 * the exact same structure and $23 haircut / $85 color economics so the UI feels
 * authentic and exercises every status (ahead, on-track, needs-attention,
 * behind, and a not-yet-started edge case).
 *
 * TODO: Review with Danny — production is synthesised as `haircuts × $23 +
 * colors × $85` (no retail add-ons) so every figure ties out exactly to the
 * workbook economics. Swap this module for the live Zenoti + PayCor pull (see
 * the "Inputs" sheet) behind `teamDashboardService`.
 */

/** The dashboard's current week (matches Rebeca's "Sched View" week). */
export const TEAM_WEEK = {
  start: "2026-06-29",
  end: "2026-07-05",
  label: "6/29 – 7/5",
} as const;

/** "Today" within the week: Thu 7/2 — Mon–Thu are worked, Fri–Sun upcoming. */
export const TEAM_TODAY = "2026-07-02";

const WEEK_DATES = [
  "2026-06-29", // Mon
  "2026-06-30", // Tue
  "2026-07-01", // Wed
  "2026-07-02", // Thu
  "2026-07-03", // Fri
  "2026-07-04", // Sat
  "2026-07-05", // Sun
];
const WEEK_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Per-day authoring spec: [scheduledHours, actualHours, haircuts, colors]. */
type DaySpec = [number, number, number, number];

function buildDays(specs: DaySpec[]): StylistDayRecord[] {
  return specs.map(([scheduledHours, actualHours, haircuts, colors], i) => {
    const upcoming = WEEK_DATES[i] > TEAM_TODAY;
    const production = upcoming ? 0 : haircuts * HAIRCUT_PRICE + colors * COLOR_PRICE;
    return {
      date: WEEK_DATES[i],
      label: WEEK_LABELS[i],
      scheduledHours,
      actualHours: upcoming ? 0 : actualHours,
      haircuts: upcoming ? 0 : haircuts,
      colors: upcoming ? 0 : colors,
      production,
    };
  });
}

interface Seed {
  id: string;
  stylistId: string;
  name: string;
  title: string;
  salonId: string;
  hue: number;
  guaranteeRate: number;
  specs: DaySpec[];
}

// Day order: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
const SEEDS: Seed[] = [
  {
    // ── REAL: Rebeca "Sched View" — pacing around $20/hr, ahead of a $19 target.
    id: "tw-rebeca",
    stylistId: "18939",
    name: "Rebeca Alvarez",
    title: "Senior Stylist",
    salonId: "s1",
    hue: 320,
    guaranteeRate: 12,
    specs: [
      [5.25, 5.25, 3, 2],
      [6.25, 6.25, 4, 3],
      [5.25, 5.25, 3, 2],
      [5.25, 5.0, 4, 2],
      [5.25, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── REAL: Steph "Actual" — solid but behind a $19 pace, recoverable.
    id: "tw-steph",
    stylistId: "11027",
    name: "Steph Nguyen",
    title: "Stylist",
    salonId: "s1",
    hue: 200,
    guaranteeRate: 13,
    specs: [
      [3, 3, 2, 1],
      [5, 5, 3, 1],
      [4, 3.5, 2, 1],
      [4, 4, 2, 2],
      [6, 0, 0, 0],
      [6, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── Modelled: top performer, well above target.
    id: "tw-camila",
    stylistId: "20514",
    name: "Camila Ortiz",
    title: "Master Stylist",
    salonId: "s1",
    hue: 265,
    guaranteeRate: 15,
    specs: [
      [0, 0, 0, 0],
      [8, 8, 4, 5],
      [8, 8, 5, 5],
      [8, 8, 4, 6],
      [8, 0, 0, 0],
      [8, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── Modelled: significantly behind, riding the guarantee.
    id: "tw-devon",
    stylistId: "19822",
    name: "Devon Brooks",
    title: "Junior Stylist",
    salonId: "s1",
    hue: 12,
    guaranteeRate: 14,
    specs: [
      [6, 6, 3, 0],
      [6, 5, 2, 1],
      [6, 6, 3, 1],
      [6, 5, 2, 1],
      [6, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── Modelled: on track, strong color book.
    id: "tw-bianca",
    stylistId: "21100",
    name: "Bianca Rossi",
    title: "Senior Stylist",
    salonId: "s2",
    hue: 160,
    guaranteeRate: 16,
    specs: [
      [0, 0, 0, 0],
      [7.5, 7.5, 5, 3],
      [7.5, 7.5, 4, 4],
      [7.5, 7.5, 5, 3],
      [7.5, 0, 0, 0],
      [7.5, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── Modelled: needs attention — low utilization (leaving early).
    id: "tw-marcus",
    stylistId: "18475",
    name: "Marcus Lee",
    title: "Stylist",
    salonId: "s2",
    hue: 95,
    guaranteeRate: 15,
    specs: [
      [8, 5, 3, 2],
      [8, 4, 2, 2],
      [8, 6, 3, 2],
      [8, 4, 2, 1],
      [8, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── Modelled: on track, consistent.
    id: "tw-aisha",
    stylistId: "22190",
    name: "Aisha Khan",
    title: "Stylist",
    salonId: "s3",
    hue: 190,
    guaranteeRate: 16,
    specs: [
      [0, 0, 0, 0],
      [8, 8, 6, 3],
      [8, 8, 5, 4],
      [8, 8, 5, 4],
      [8, 0, 0, 0],
      [8, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    // ── Modelled: edge case — week not started (weekend-only schedule).
    id: "tw-tomas",
    stylistId: "17903",
    name: "Tomás Rivera",
    title: "Junior Stylist",
    salonId: "s3",
    hue: 35,
    guaranteeRate: 14,
    specs: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [8, 0, 0, 0],
      [8, 0, 0, 0],
      [5, 0, 0, 0],
    ],
  },
];

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
  return SEEDS.map((s) => ({
    id: s.id,
    stylistId: s.stylistId,
    name: s.name,
    title: s.title,
    salonId: s.salonId,
    hue: s.hue,
    guaranteeRate: s.guaranteeRate,
    weekStart: TEAM_WEEK.start,
    weekEnd: TEAM_WEEK.end,
    weekLabel: TEAM_WEEK.label,
    days: buildDays(s.specs),
  }));
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

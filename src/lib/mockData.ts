import type { DayRecord, MessageAcknowledgment, MessageBoardPost, PayConfig, Salon, StylistData, UsageStat, User } from "./types";
import { CLIENT_ROSTER, CLIENT_SALONS, CLIENT_WEEK_START, type RosterPerson } from "./clientRoster";
import { addDays, WEEKS } from "./time";
import { COLOR_PRICE, HAIRCUT_PRICE, NP_PERCENT, NP_RATE, PPH_TIERS } from "./tiers";

/*
 * DEMO DATA — sourced from the client's real export (see `clientRoster.ts`).
 *
 * The credential-free demo build (NEXT_PUBLIC_DEMO_MODE=true) renders this data
 * so the client POC can browse every real salon, employee, profile and number
 * without logging in. Salons, users, per-employee guarantee rates and each
 * person's weekly Net service Rev all come straight from the export; only the
 * per-day split of the weekly totals is synthesised (evenly across the working
 * week) since the export is a weekly aggregate. Weekly totals always tie out.
 */

/* ------------------------- Helpers ------------------------- */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Split "Burleson, TX" → { name: "Burleson", city: "TX" }. */
function splitSalonName(display: string): { name: string; city: string } {
  const idx = display.indexOf(",");
  if (idx === -1) return { name: display.trim(), city: "" };
  return { name: display.slice(0, idx).trim(), city: display.slice(idx + 1).trim() };
}

/** Evenly spread a total across n buckets (exact sum; floats). */
function spread(total: number, n: number): number[] {
  if (n <= 0) return [];
  return Array.from({ length: n }, () => total / n);
}

/** Spread an integer total across n buckets (remainder on the first buckets). */
function spreadInt(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/* ----------------------------- Salons ----------------------------- */
export const SALONS: Salon[] = CLIENT_SALONS.map((s) => {
  const { name, city } = splitSalonName(s.name);
  return { id: s.id, name, city, servicePrices: { haircut: 23, color: 85 } };
});

const FALLBACK_SALON: Salon = { id: "unknown", name: "Unknown salon", city: "", servicePrices: { haircut: 23, color: 85 } };
export const salonById = (id: string): Salon => SALONS.find((s) => s.id === id) ?? FALLBACK_SALON;

/** Repository helper: all stylists in a salon (parity with the backend repo). */
export const getStylistsBySalon = (salonId: string): User[] =>
  ALL_STYLISTS.filter((s) => s.salonId === salonId);

/* ----------------------------- Users ------------------------------ */
// Each salon's manager (first roster person with the manager role in it).
const MANAGER_ID_BY_SALON = new Map<string, string>();
for (const p of CLIENT_ROSTER) {
  if (p.role === "manager" && !MANAGER_ID_BY_SALON.has(p.salonId)) {
    MANAGER_ID_BY_SALON.set(p.salonId, p.id);
  }
}

/**
 * Employees the client marked "Exclude" (not on the PPH pay plan) in the pay-period
 * spreadsheets (`PPH Data 06-22-2026 TO 07-05-2026.xlsx` /
 * `… 07-06-2026 TO 07-19-2026.xlsx`), by employee code (latest designation wins).
 * Excluded users have no personal PPH dashboard — only team visibility if they
 * manage people. The other roster members are "Include". An Admin can change any
 * of this from the Admin → Users screen.
 */
const EXCLUDED_EMPLOYEE_CODES = new Set<string>([
  "VG1116", "VG1124", "VG1126", "VG1134", "VG1137", "VG1140", "VG1143", "VG1158",
  "VG1161", "VG1165", "VG1170", "VG1210", "VG1235", "VG1280", "VG1295", "VG1296",
  "VG1301", "VG1305", "VG1327", "VG1344", "VG1346", "VG1348", "VG1361", "VG1363",
  "VG1368", "VG1373", "VG1376", "VG1381", "VG1392", "VG1406", "VG1426", "VG1429",
  "VG1438", "VG1443", "VG1452", "VG1460", "VG1467", "VG1469", "VG1473", "VG1478",
  "VG1480", "VG1488", "VG1496", "VG1498",
]);

function isExcludedCode(employeeCode: string | undefined): boolean {
  return !!employeeCode && EXCLUDED_EMPLOYEE_CODES.has(employeeCode.toUpperCase());
}

function toUser(p: RosterPerson): User {
  const salon = salonById(p.salonId);
  const isManager = p.role === "manager";
  return {
    id: p.id,
    name: p.name,
    role: isManager ? "manager" : "stylist",
    salonId: p.salonId,
    managerId: isManager ? undefined : MANAGER_ID_BY_SALON.get(p.salonId),
    title: isManager ? `Salon Manager · ${salon.name}` : "Stylist",
    initials: initialsOf(p.name),
    hue: p.hue,
    guaranteeRate: p.guaranteeRate,
    // Include/Exclude designation from the client's pay-period spreadsheets.
    excluded: p.excluded ?? isExcludedCode(p.employeeCode),
  };
}

const STYLISTS: User[] = CLIENT_ROSTER.filter((p) => p.role === "stylist").map(toUser);
const MANAGERS: User[] = CLIENT_ROSTER.filter((p) => p.role === "manager").map(toUser);

/** The client point-of-contact — an owner/SDL persona that sees every salon. */
export const OWNER: User = {
  id: "owner",
  name: "Owner / SDL (Demo)",
  role: "sdl",
  salonId: SALONS[0]?.id ?? "s1",
  title: "Owner · Salon Development Leader",
  initials: "SD",
  hue: 28,
  // SDL/Owner is a management persona — not on the PPH pay plan.
  excluded: true,
};

/** The top Admin persona — full editing/import/config + payment-logic rights. */
export const ADMIN: User = {
  id: "admin",
  name: "Admin (Demo)",
  role: "admin",
  salonId: SALONS[0]?.id ?? "s1",
  title: "Administrator",
  initials: "AD",
  hue: 265,
  excluded: true,
};

export const ALL_STYLISTS = STYLISTS;
export const USERS: User[] = [...STYLISTS, ...MANAGERS, OWNER, ADMIN];
export const userById = (id: string) => USERS.find((u) => u.id === id);

/** Personas featured at the top of the demo account switcher (all are browsable). */
export const DEMO_ACCOUNT_IDS = [
  ADMIN.id,
  OWNER.id,
  MANAGERS[0]?.id,
  STYLISTS[0]?.id,
  STYLISTS[Math.floor(STYLISTS.length / 2)]?.id,
].filter(Boolean) as string[];

/* --------------------- Daily data generation ----------------------- */
// The export is a weekly aggregate; we spread each person's totals across the
// working week (Mon–Sat) as completed days so the dashboards show the real
// weekly figures. Sunday is off. Weekly sums always equal the export values.
const WORKING_DAYS = 6; // Mon–Sat

/**
 * Deterministic per-(person, week) multiplier so historical pay periods show
 * plausible, stable variation instead of identical numbers. The current client
 * week is always factor 1.0 so it ties out EXACTLY to the export (and to the
 * pay-parity regression tests). Range ~0.68–1.18.
 */
function weekFactor(personId: string, weekStart: string): number {
  if (weekStart === CLIENT_WEEK_START) return 1;
  let h = 2166136261 ^ (personId.length + weekStart.length);
  const s = `${personId}|${weekStart}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map the 32-bit hash into [0.68, 1.18].
  const unit = ((h >>> 0) % 1000) / 1000; // 0..1
  return round2(0.68 + unit * 0.5);
}

/** Build one week's worth of day records for a person, scaled by `factor`. */
function genWeekDays(p: RosterPerson, weekStart: string, factor: number): DayRecord[] {
  const scheduled = p.scheduledHrs * factor;
  const actual = p.actualHrs * factor;
  const rev = p.netServiceRev * factor;
  const schedule = spread(scheduled, WORKING_DAYS);
  const worked = spread(actual, WORKING_DAYS);
  const production = spread(rev, WORKING_DAYS);
  const haircutPrice = p.avgHaircut || 23;
  const colorPrice = p.avgColor || 85;
  // Split revenue into a plausible service mix (55% of $ from haircuts) purely
  // for the count displays; production ($) is authoritative and ties out exactly.
  const weeklyHaircuts = Math.max(0, Math.round((rev * 0.55) / haircutPrice));
  const weeklyColors = Math.max(0, Math.round((rev * 0.45) / colorPrice));
  const haircuts = spreadInt(weeklyHaircuts, WORKING_DAYS);
  const colors = spreadInt(weeklyColors, WORKING_DAYS);

  const days: DayRecord[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (i >= WORKING_DAYS) {
      days.push({ date, scheduledHours: 0, workedHours: 0, haircuts: 0, colors: 0, production: 0 });
      continue;
    }
    days.push({
      date,
      scheduledHours: round2(schedule[i]),
      workedHours: round2(worked[i]),
      haircuts: haircuts[i],
      colors: colors[i],
      production: production[i], // exact float; weekly sum === weekly total
    });
  }
  return days;
}

/**
 * Generate day records across EVERY week in the time model (not just the current
 * one) so historical pay periods can be selected and viewed. This is the demo's
 * persistent "data over time": the current week matches the client export
 * exactly, and prior/upcoming weeks carry deterministic variation. In the live
 * app the equivalent history lives in Postgres (see /api/v1/performance/*).
 */
function genDaysForPerson(p: RosterPerson): DayRecord[] {
  const days: DayRecord[] = [];
  for (const w of WEEKS) {
    days.push(...genWeekDays(p, w.start, weekFactor(p.id, w.start)));
  }
  return days;
}

export const STYLIST_DATA: Record<string, StylistData> = Object.fromEntries(
  CLIENT_ROSTER.map((p) => [p.id, { stylistId: p.id, days: genDaysForPerson(p) }]),
);

/* --------------------------- Usage stats --------------------------- */
function seeded(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genUsage(userId: string): UsageStat {
  const rnd = seeded(`usage:${userId}`);
  const daysOpened = 3 + Math.floor(rnd() * 11);
  return {
    userId,
    daysOpenedLast14: daysOpened,
    plannerUsesLast14: Math.floor(rnd() * (daysOpened + 1)),
    lastActive: addDays(CLIENT_WEEK_START, 5 - Math.floor(rnd() * 3)),
    streak: Math.floor(rnd() * 9),
    goalsHit: Math.floor(rnd() * 6),
  };
}

export const USAGE: Record<string, UsageStat> = Object.fromEntries(
  USERS.map((u) => [u.id, genUsage(u.id)]),
);

/* ------------------------- Default pay config ---------------------- */
// Per-salon guarantee floor = the lowest guarantee among that salon's roster,
// so nobody is over-floored. Per-employee guarantees still drive the profile.
const salonGuarantee: Record<string, number> = {};
for (const p of CLIENT_ROSTER) {
  const cur = salonGuarantee[p.salonId];
  salonGuarantee[p.salonId] = cur == null ? p.guaranteeRate : Math.min(cur, p.guaranteeRate);
}

export const DEFAULT_CONFIG: PayConfig = {
  // The global payment tier table (seeded from the canonical workbook ladder).
  tiers: PPH_TIERS.map((t) => ({ payRate: t.payRate, pphRequired: t.pphRequired })),
  // Net-production share (workbook NP rate) — drives off-tier PPH + guarantee floor.
  npRate: NP_RATE,
  npPercent: NP_PERCENT,
  // Canonical per-service prices — the client's Avg Haircut / Avg Color ($23/$85).
  haircutPrice: HAIRCUT_PRICE,
  colorPrice: COLOR_PRICE,
  // Global default guarantee floor (the client's Holliean example uses $10).
  guaranteeRate: 10,
  // Net-production share used for the commission-vs-guarantee split display.
  commissionRate: 0.4,
  // Average ticket used to project production into service counts (mirror prices).
  avgTicketHaircut: HAIRCUT_PRICE,
  avgTicketColor: COLOR_PRICE,
  serviceMixHaircut: 0.6,
  minServicesPerDay: 6,
  // Retained for backwards-compatible persistence only — NOT used by the engine
  // (payment logic is global; there are no per-salon overrides).
  salonGuarantee,
  salonServicePrices: {},
};

/* ------------------------- Message board seed ---------------------- */
const SEED_MANAGER = MANAGERS[0];
const SEED_SALON_STYLISTS = SEED_MANAGER
  ? STYLISTS.filter((s) => s.salonId === SEED_MANAGER.salonId)
  : [];

export const BOARD_SEED_POSTS: MessageBoardPost[] = [
  {
    id: "mp1",
    authorId: OWNER.id,
    authorRole: "sdl",
    salonId: null,
    targetAudience: { kind: "all" },
    title: "☀️ Summer Color Campaign kicks off Monday",
    content:
      "Team — our biggest color promo of the year starts Monday. Push balayage and gloss add-ons at every consultation. Let's make it a record month across all salons!",
    createdAt: "2026-06-23T14:00:00.000Z",
    isPinned: true,
  },
  ...(SEED_MANAGER
    ? [
        {
          id: "mp2",
          authorId: SEED_MANAGER.id,
          authorRole: "manager" as const,
          salonId: SEED_MANAGER.salonId,
          targetAudience: { kind: "salons" as const, salonIds: [SEED_MANAGER.salonId] },
          title: "Saturday all-hands huddle @ 9:00am",
          content:
            "Quick 15-minute huddle before doors open this Saturday. We'll cover the new booking flow and weekend goals. Coffee's on me.",
          createdAt: "2026-06-24T17:30:00.000Z",
          isPinned: false,
        },
      ]
    : []),
];

export const BOARD_SEED_ACKS: MessageAcknowledgment[] = SEED_SALON_STYLISTS.slice(0, 2).map((s, i) => ({
  id: `ma${i + 1}`,
  postId: "mp2",
  userId: s.id,
  acknowledgedAt: "2026-06-24T18:05:00.000Z",
}));

/* --------------------------- Hierarchy ----------------------------- */
export function stylistsForUser(user: User): User[] {
  if (user.role === "stylist") return STYLISTS.filter((s) => s.id === user.id);
  if (user.role === "manager") return STYLISTS.filter((s) => s.managerId === user.id);
  return STYLISTS; // sdl / admin see all
}

export function visibleSalons(user: User): Salon[] {
  if (user.role === "sdl" || user.role === "admin") return SALONS;
  const ids = new Set(stylistsForUser(user).map((s) => s.salonId));
  if (user.role === "manager") ids.add(user.salonId);
  return SALONS.filter((s) => ids.has(s.id));
}

export function managerOf(stylist: User): User | undefined {
  return stylist.managerId ? userById(stylist.managerId) : undefined;
}

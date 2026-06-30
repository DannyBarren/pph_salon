import type { DayRecord, PayConfig, Salon, StylistData, UsageStat, User } from "./types";
import { TODAY, WEEKS, addDays, daysOfWeek, weekdayIndex } from "./time";

/* ----------------------------- Salons ----------------------------- */
export const SALONS: Salon[] = [
  { id: "s1", name: "Aria Studio", city: "Downtown" },
  { id: "s2", name: "Lumière Salon", city: "Westside" },
  { id: "s3", name: "Maven Hair Co.", city: "Uptown" },
];

export const salonById = (id: string) => SALONS.find((s) => s.id === id)!;

/* ----------------------------- Users ------------------------------ */
// Managers
const MANAGERS: User[] = [
  { id: "m1", name: "Priya Shah", role: "manager", salonId: "s1", title: "Salon Manager · Aria Studio", initials: "PS", hue: 265 },
  { id: "m2", name: "Marco Bell", role: "manager", salonId: "s2", title: "Salon Manager · Lumière", initials: "MB", hue: 200 },
  { id: "m3", name: "Elena Cruz", role: "manager", salonId: "s3", title: "Salon Manager · Maven", initials: "EC", hue: 160 },
];

// Owner / SDL
const OWNER: User = {
  id: "sdl1",
  name: "Jordan Avery",
  role: "sdl",
  salonId: "s1",
  title: "Owner · Salon Development Leader",
  initials: "JA",
  hue: 28,
};

// Stylists (managerId links each to a salon manager)
const STYLISTS: User[] = [
  { id: "st1", name: "Maya Patel", role: "stylist", salonId: "s1", managerId: "m1", title: "Senior Stylist", initials: "MP", hue: 320 },
  { id: "st2", name: "Leo Martins", role: "stylist", salonId: "s1", managerId: "m1", title: "Stylist", initials: "LM", hue: 215 },
  { id: "st3", name: "Dana Kim", role: "stylist", salonId: "s1", managerId: "m1", title: "Junior Stylist", initials: "DK", hue: 12 },
  { id: "st4", name: "Chris Boyd", role: "stylist", salonId: "s1", managerId: "m1", title: "Stylist", initials: "CB", hue: 145 },
  { id: "st5", name: "Noah Webb", role: "stylist", salonId: "s1", managerId: "m1", title: "Stylist", initials: "NW", hue: 280 },

  { id: "st6", name: "Sofia Reyes", role: "stylist", salonId: "s2", managerId: "m2", title: "Master Stylist", initials: "SR", hue: 340 },
  { id: "st7", name: "Aisha Khan", role: "stylist", salonId: "s2", managerId: "m2", title: "Stylist", initials: "AK", hue: 190 },
  { id: "st8", name: "Ben Carter", role: "stylist", salonId: "s2", managerId: "m2", title: "Junior Stylist", initials: "BC", hue: 95 },
  { id: "st9", name: "Kira Novak", role: "stylist", salonId: "s2", managerId: "m2", title: "Senior Stylist", initials: "KN", hue: 250 },

  { id: "st10", name: "Tom Hayes", role: "stylist", salonId: "s3", managerId: "m3", title: "Stylist", initials: "TH", hue: 35 },
  { id: "st11", name: "Grace Lin", role: "stylist", salonId: "s3", managerId: "m3", title: "Senior Stylist", initials: "GL", hue: 300 },
  { id: "st12", name: "Owen Diaz", role: "stylist", salonId: "s3", managerId: "m3", title: "Junior Stylist", initials: "OD", hue: 120 },
];

export const ALL_STYLISTS = STYLISTS;
export const USERS: User[] = [...STYLISTS, ...MANAGERS, OWNER];
export const userById = (id: string) => USERS.find((u) => u.id === id);

/** Personas surfaced in the demo account switcher. */
export const DEMO_ACCOUNT_IDS = ["st1", "st2", "st6", "m1", "sdl1"];

/* --------------------- Stylist generation profiles ----------------- */
interface Profile {
  servicesPerDay: number; // avg services on a working day
  colorRatio: number; // fraction of services that are colors
  hoursPerDay: number;
  variance: number; // 0-1 randomness
}

const PROFILES: Record<string, Profile> = {
  st1: { servicesPerDay: 8.2, colorRatio: 0.42, hoursPerDay: 8, variance: 0.18 },
  st2: { servicesPerDay: 6.4, colorRatio: 0.35, hoursPerDay: 8, variance: 0.22 },
  st3: { servicesPerDay: 4.3, colorRatio: 0.28, hoursPerDay: 7, variance: 0.3 },
  st4: { servicesPerDay: 7.1, colorRatio: 0.38, hoursPerDay: 8, variance: 0.2 },
  st5: { servicesPerDay: 5.4, colorRatio: 0.3, hoursPerDay: 7.5, variance: 0.26 },
  st6: { servicesPerDay: 8.6, colorRatio: 0.5, hoursPerDay: 8, variance: 0.16 },
  st7: { servicesPerDay: 6.0, colorRatio: 0.34, hoursPerDay: 8, variance: 0.24 },
  st8: { servicesPerDay: 4.8, colorRatio: 0.26, hoursPerDay: 7, variance: 0.3 },
  st9: { servicesPerDay: 7.6, colorRatio: 0.44, hoursPerDay: 8, variance: 0.18 },
  st10: { servicesPerDay: 6.1, colorRatio: 0.33, hoursPerDay: 7.5, variance: 0.24 },
  st11: { servicesPerDay: 8.0, colorRatio: 0.46, hoursPerDay: 8, variance: 0.17 },
  st12: { servicesPerDay: 4.6, colorRatio: 0.24, hoursPerDay: 7, variance: 0.32 },
};

// Baseline recorded prices used to synthesize historical revenue. These are
// independent of the (config-driven) planning ticket prices on purpose.
const HC_PRICE = 49;
const COLOR_PRICE = 138;

// Deterministic seeded RNG (mulberry32) keyed by stylist + date.
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

function genDay(stylistId: string, date: string, p: Profile): DayRecord {
  const wd = weekdayIndex(date); // Mon=0 .. Sun=6
  // Schedule: most stylists work Tue–Sat. Sun + Mon off (simple, realistic).
  const working = wd >= 1 && wd <= 5;
  if (!working) {
    return { date, scheduledHours: 0, workedHours: 0, haircuts: 0, colors: 0, production: 0 };
  }
  const scheduledHours = p.hoursPerDay;

  // Future days (and today): scheduled but not yet produced.
  if (date >= TODAY) {
    return { date, scheduledHours, workedHours: 0, haircuts: 0, colors: 0, production: 0 };
  }

  const rnd = seeded(`${stylistId}:${date}`);
  const wiggle = 1 + (rnd() - 0.5) * 2 * p.variance;
  const services = Math.max(0, Math.round(p.servicesPerDay * wiggle));
  const colors = Math.round(services * p.colorRatio);
  const haircuts = Math.max(0, services - colors);
  const upsell = rnd() * 60; // retail / add-ons
  const production = Math.round(haircuts * HC_PRICE + colors * COLOR_PRICE + upsell);
  const workedHours = Math.round((scheduledHours + (rnd() - 0.5)) * 4) / 4;
  return { date, scheduledHours, workedHours, haircuts, colors, production };
}

function genStylistData(stylistId: string): StylistData {
  const p = PROFILES[stylistId];
  const days: DayRecord[] = [];
  for (const week of WEEKS) {
    for (const date of daysOfWeek(week)) {
      days.push(genDay(stylistId, date, p));
    }
  }
  return { stylistId, days };
}

export const STYLIST_DATA: Record<string, StylistData> = Object.fromEntries(
  STYLISTS.map((s) => [s.id, genStylistData(s.id)]),
);

/* --------------------------- Usage stats --------------------------- */
function genUsage(userId: string): UsageStat {
  const rnd = seeded(`usage:${userId}`);
  const daysOpened = 3 + Math.floor(rnd() * 11); // 3-13
  return {
    userId,
    daysOpenedLast14: daysOpened,
    plannerUsesLast14: Math.floor(rnd() * (daysOpened + 1)),
    lastActive: addDays(TODAY, -Math.floor(rnd() * 3)),
    streak: Math.floor(rnd() * 9),
    goalsHit: Math.floor(rnd() * 6),
  };
}

export const USAGE: Record<string, UsageStat> = Object.fromEntries(
  USERS.map((u) => [u.id, genUsage(u.id)]),
);

/* ------------------------- Default pay config ---------------------- */
export const DEFAULT_CONFIG: PayConfig = {
  guaranteeRate: 16,
  commissionRate: 0.42,
  avgTicketHaircut: 48,
  avgTicketColor: 135,
  serviceMixHaircut: 0.6,
  minServicesPerDay: 6,
  salonGuarantee: { s1: 17, s2: 16, s3: 15 },
};

/* --------------------------- Hierarchy ----------------------------- */
export function stylistsForUser(user: User): User[] {
  if (user.role === "stylist") return STYLISTS.filter((s) => s.id === user.id);
  if (user.role === "manager") return STYLISTS.filter((s) => s.managerId === user.id);
  return STYLISTS; // sdl sees all
}

export function visibleSalons(user: User): Salon[] {
  if (user.role === "sdl") return SALONS;
  const ids = new Set(stylistsForUser(user).map((s) => s.salonId));
  return SALONS.filter((s) => ids.has(s.id));
}

export function managerOf(stylist: User): User | undefined {
  return stylist.managerId ? userById(stylist.managerId) : undefined;
}

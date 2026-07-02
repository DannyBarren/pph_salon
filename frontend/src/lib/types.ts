export type Role = "stylist" | "manager" | "sdl";

export interface Salon {
  id: string;
  name: string;
  city: string;
  /** Optional per-salon override of the global guarantee rate. */
  guaranteeRate?: number;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  salonId: string;
  /** Manager this stylist reports to (stylists only). */
  managerId?: string;
  title: string;
  initials: string;
  /** color accent for avatar */
  hue: number;
}

/** A single recorded day of work for a stylist. */
export interface DayRecord {
  /** ISO date (yyyy-mm-dd) */
  date: string;
  scheduledHours: number;
  workedHours: number;
  haircuts: number;
  colors: number;
  /** Recorded service revenue for the day in dollars. */
  production: number;
}

export interface StylistData {
  stylistId: string;
  days: DayRecord[];
}

export interface UsageStat {
  userId: string;
  daysOpenedLast14: number;
  plannerUsesLast14: number;
  lastActive: string;
  streak: number;
  goalsHit: number;
}

/** Admin-configurable parameters driving the whole pay engine. */
export interface PayConfig {
  /** Global base hourly guarantee (used when a salon has no override). */
  guaranteeRate: number;
  /** Fraction (0-1) of production paid out as commission. */
  commissionRate: number;
  avgTicketHaircut: number;
  avgTicketColor: number;
  /** Fraction (0-1) of projected future services that are haircuts. */
  serviceMixHaircut: number;
  /** Minimum expected services per scheduled day. */
  minServicesPerDay: number;
  /** Per-salon guarantee overrides keyed by salon id. */
  salonGuarantee: Record<string, number>;
}

export type TimeView = "current-prior" | "pay-period" | "single-week" | "planner";

export interface Week {
  id: string;
  /** ISO date of the Monday that starts the week. */
  start: string;
  /** ISO date of the Sunday that ends the week. */
  end: string;
  label: string;
  /** Index of the pay period this week belongs to. */
  periodIndex: number;
}

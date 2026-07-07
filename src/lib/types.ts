// The app's role model. `sdl` is the salon-development-leader / owner persona
// and carries owner+admin privileges (full access, admin config). The backend
// uses the fuller stylist | manager | admin | owner set; on the frontend `sdl`
// maps to owner/admin. See `canSeeMoney` for the privacy split that actually
// matters to the UI (stylist vs. everyone else).
export type Role = "stylist" | "manager" | "sdl";

/** Per-service production/price values, keyed by service name. */
export interface ServicePrices {
  haircut: number;
  color: number;
  [service: string]: number;
}

export interface Salon {
  id: string;
  name: string;
  city: string;
  /** Optional per-salon override of the global guarantee rate. */
  guaranteeRate?: number;
  /** Configurable per-service prices (defaults: haircut $23, color $85). */
  servicePrices?: ServicePrices;
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
  /** Contact + pay fields (used by the Admin Data Management screen). */
  email?: string;
  phone?: string;
  /** Per-stylist guaranteed $/hr floor (falls back to salon/global rate). */
  guaranteeRate?: number;
}

/**
 * A stylist's week of data, keyed by (userId, weekStart) — mirrors the backend
 * `Week`/WeeklyData model. Manually editable and bulk-importable; works even
 * when Zenoti/PayCor are unavailable.
 */
export interface WeeklyData {
  userId: string;
  /** ISO Monday of the week. */
  weekStart: string;
  /** ISO Sunday of the week. */
  weekEnd?: string;
  scheduledHrs: number;
  actualHrs: number;
  actualHaircuts: number;
  actualColors: number;
  /** Revenue from services other than haircuts/colors (retail, add-ons). */
  actualOtherValue: number;
  notes?: string;
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
  /** Per-salon service-price overrides keyed by salon id (e.g. {haircut, color}). */
  salonServicePrices: Record<string, ServicePrices>;
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

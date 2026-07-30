// The app's role model. Hierarchy (highest → lowest): admin > sdl > manager >
// stylist. `admin` is the new top level with EXCLUSIVE editing / import /
// configuration / payment-logic rights. `sdl` (Salon Development Leader / Owner)
// can view team data and change the Desired Pay Rate, but has no admin rights.
// Backend roles map: admin→admin, owner→sdl, manager→manager, stylist→stylist.
export type Role = "stylist" | "manager" | "sdl" | "admin";

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
  /**
   * Excluded from the PPH pay plan. Excluded users get NO personal pay/PPH
   * dashboard and land on team/management views only (typically managers/SDL).
   */
  excluded?: boolean;
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

/** A single row of the global payment tier table (pay_rate ↔ pph_required). */
export interface PayTierRow {
  /** Hourly pay rate ($/hr). */
  payRate: number;
  /** Production-per-hour required to earn this rate. */
  pphRequired: number;
}

/**
 * Admin-configurable parameters driving the whole pay engine.
 *
 * This is the organisation-wide payment logic — the single source of truth for
 * every calculation shown to any user. It is GLOBAL ONLY: `salonGuarantee` /
 * `salonServicePrices` are retained for backwards-compatible persistence but are
 * no longer consulted by the calculation engine (see `payEngine.guaranteeRateFor`
 * and `privacy.servicePricesFor`). Only the highest admin (Owner) may change it.
 */
export interface PayConfig {
  /** The payment tier table (pay_rate ↔ pph_required), ascending by payRate. */
  tiers: PayTierRow[];
  /** Net-production share (0-1) — drives off-tier PPH and the guarantee floor. */
  npRate: number;
  /** Net-profit percentage surfaced on reports (informational). */
  npPercent: number;
  /** Net production ($) per haircut — canonical service price. */
  haircutPrice: number;
  /** Net production ($) per color — canonical service price. */
  colorPrice: number;
  /** Global base hourly guarantee (the single org-wide floor). */
  guaranteeRate: number;
  /**
   * Net-production share (0-1). Effective $/hr is driven by the tiered PPH ladder
   * (`tiers.ts`); this is the aligned net rate (0.40) used for commission display.
   */
  commissionRate: number;
  /** Net production ($) per haircut — used to project production into service counts. */
  avgTicketHaircut: number;
  /** Net production ($) per color — used to project production into service counts. */
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

/* --------------------------- Message board ------------------------- */

/** Who an announcement is aimed at. */
export type TargetAudience =
  | { kind: "all" }
  | { kind: "salons"; salonIds: string[] }
  | { kind: "users"; userIds: string[] };

export interface MessageBoardPost {
  id: string;
  authorId: string;
  authorRole: Role;
  /** Single-salon scope, or null for multi/all targeting. */
  salonId: string | null;
  targetAudience: TargetAudience;
  title: string;
  content: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Optional ISO expiry; hidden from non-authors once passed. */
  expiresAt?: string;
  isPinned: boolean;
}

export interface MessageAcknowledgment {
  id: string;
  postId: string;
  userId: string;
  acknowledgedAt: string;
}

/* ------------------------------ Goals ------------------------------ */

export type GoalApprovalStatus = "pending" | "approved" | "disapproved";

/**
 * A stylist's self-set target for a pay period. Business rule: only ONE active
 * goal per (stylistId, weekStart). Setting a new one deactivates the previous
 * (kept for history) and links via `previousGoalId`.
 */
export interface Goal {
  id: string;
  stylistId: string;
  /** ISO Monday of the pay-period week. */
  weekStart: string;
  targetPph: number;
  targetHours: number;
  targetHaircuts: number;
  targetColors: number;
  /** ISO timestamp the goal was set. */
  setAt: string;
  isActive: boolean;
  previousGoalId?: string;
  approvalStatus: GoalApprovalStatus;
  managerComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export type NotificationType = "goal_set" | "goal_updated" | "goal_reviewed";

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  message: string;
  goalId?: string;
  isRead: boolean;
  createdAt: string;
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

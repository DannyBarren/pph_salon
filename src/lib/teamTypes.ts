import type { Tier } from "./tiers";

/**
 * Domain types for the Team Dashboard. `StylistPerformance` is the fully-derived,
 * view-ready record a manager sees for one stylist; `TeamKPIs` is the aggregate
 * roll-up shown in the header cards.
 */

/** A stylist's coaching status for the current week. */
export type PerformanceStatus = "on_track" | "needs_attention" | "behind";

/** Which lens the dashboard is showing (mirrors the two Excel sheets). */
export type PerfView = "scheduled" | "actual";

/** Raw, unvalidated stylist week record as it would arrive from Zenoti/PayCor. */
export interface StylistWeekRecord {
  /** Internal stable id. */
  id: string;
  /** Display roster id from the salon system (e.g. "18939"). */
  stylistId: string;
  name: string;
  title: string;
  salonId: string;
  /** Avatar accent hue (0-360). */
  hue: number;
  /** Guarantee pay rate ($/hr) for this stylist/salon. */
  guaranteeRate: number;
  /** Week start/end ISO dates and a human label like "6/29 – 7/5". */
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  /** Per-day rows for the week (Mon→Sun order not required). */
  days: StylistDayRecord[];
}

export interface StylistDayRecord {
  date: string;
  /** Short weekday label, e.g. "Mo". */
  label: string;
  scheduledHours: number;
  actualHours: number;
  production: number;
  haircuts: number;
  colors: number;
}

/** What a stylist still needs to do to reach a target pay rate this week. */
export interface RemainingWork {
  targetPayRate: number;
  remainingProduction: number;
  remainingHaircuts: number;
  remainingColors: number;
  remainingHours: number;
  requiredPphRemaining: number;
  /** True once the target is already locked in. */
  achieved: boolean;
}

/** Fully-derived, view-ready performance record for one stylist. */
export interface StylistPerformance {
  id: string;
  stylistId: string;
  name: string;
  firstName: string;
  initials: string;
  title: string;
  salonId: string;
  hue: number;

  weekStart: string;
  weekEnd: string;
  weekLabel: string;

  guaranteeRate: number;
  scheduledHours: number;
  actualHours: number;
  remainingScheduledHours: number;
  /** actualHours / scheduledHours (0-1+). */
  utilization: number;

  production: number;
  /** max(commission, guarantee) pay earned so far. */
  pay: number;
  onGuarantee: boolean;

  /** Achieved production-per-hour on completed work. */
  pph: number;
  /** Headline effective $/hr (step tier, floored at guarantee). */
  effectiveRate: number;

  achievedTier: Tier | null;
  nextTier: Tier | null;
  /** 0-1 progress from the achieved tier toward the next. */
  tierProgress: number;

  targetPayRate: number;
  status: PerformanceStatus;
  /** Production over/short vs the target requirement. Negative = short. */
  productionDelta: number;
  /** Fraction of the target production requirement achieved. */
  pctOfTarget: number;

  /** What's still needed to reach the target this week. */
  remainingToTarget: RemainingWork;
  /** What's needed to hold the currently-achieved rate to end of week. */
  remainingToHold: RemainingWork;

  /** Daily production vs required, for the mini trend / sparkline. */
  daily: DailyPoint[];
}

export interface DailyPoint {
  date: string;
  label: string;
  production: number;
  requiredProduction: number;
  scheduledHours: number;
  actualHours: number;
  haircuts: number;
  colors: number;
  /** True if the day hasn't been worked yet (scheduled, no activity). */
  upcoming: boolean;
}

/** Aggregate team KPIs for the header cards. */
export interface TeamKPIs {
  totalStylists: number;
  avgEffectiveRate: number;
  totalProduction: number;
  onTrackCount: number;
  needsAttentionCount: number;
  behindCount: number;
  /** teamActualHours / teamScheduledHours (0-1+). */
  teamUtilization: number;
  totalScheduledHours: number;
  totalActualHours: number;
  /** Distribution of stylists into effective-rate bands. */
  distribution: RateBand[];
}

export interface RateBand {
  label: string;
  min: number;
  max: number;
  count: number;
}

export type StatusFilter = "all" | "on_track" | "needs_attention" | "behind";

export type SortKey = "effectiveRate" | "gapToNext" | "utilization" | "name" | "production";

export interface TeamFilters {
  search: string;
  status: StatusFilter;
  sort: SortKey;
  view: PerfView;
}

/** Payload returned by the data service (pre-derivation). */
export interface TeamDataPayload {
  records: StylistWeekRecord[];
  /** Server-side generation timestamp (ISO). */
  generatedAt: string;
  /** Data source tag so the UI can show "mock" vs "live". */
  source: "mock" | "zenoti+paycor";
}

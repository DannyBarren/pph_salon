import {
  getAchievedTier,
  getCurrentEffectivePayRate,
  getEffectiveRateFromPph,
  getNextTier,
  getPph,
  getRequiredProductionForPayRate,
  getTierProgress,
  pphForRate,
  productionToServices,
} from "./tiers";
import { TEAM_TODAY } from "./teamData";
import type {
  DailyPoint,
  PerformanceStatus,
  RateBand,
  RemainingWork,
  StylistPerformance,
  StylistWeekRecord,
  TeamKPIs,
} from "./teamTypes";

/**
 * Pure derivation layer: turns a raw {@link StylistWeekRecord} into a fully
 * computed {@link StylistPerformance} using the tiered engine in `tiers.ts`.
 * Kept side-effect free and memo-friendly so the dashboard can recompute cheaply
 * when the target rate or view changes.
 */

/** Status thresholds (documented so coaching rules are auditable). */
export const STATUS_THRESHOLDS = {
  /** Pace ratio at/above which a stylist counts as on track. */
  onTrackPace: 0.9,
  /** Utilization at/above which a stylist counts as on track. */
  onTrackUtilization: 0.8,
  /** Pace ratio below which a stylist is behind. */
  behindPace: 0.7,
  /** Utilization below which a stylist is behind. */
  behindUtilization: 0.65,
} as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function servicesFor(production: number, share = 0.5): { haircuts: number; colors: number } {
  return productionToServices(production, share).blended;
}

function remainingWork(
  targetPayRate: number,
  scheduledHoursTotal: number,
  productionToDate: number,
  remainingHours: number,
): RemainingWork {
  const requiredTotal = getRequiredProductionForPayRate(scheduledHoursTotal, targetPayRate);
  const remainingProduction = Math.max(0, requiredTotal - productionToDate);
  const { haircuts, colors } = servicesFor(remainingProduction);
  return {
    targetPayRate,
    remainingProduction,
    remainingHaircuts: haircuts,
    remainingColors: colors,
    remainingHours,
    requiredPphRemaining: remainingHours > 0 ? remainingProduction / remainingHours : 0,
    achieved: remainingProduction <= 0,
  };
}

/**
 * Derive one stylist's performance for the week.
 *
 * @param record       raw week record
 * @param targetPayRate salon/week target pay rate driving progress + status
 */
export function deriveStylistPerformance(record: StylistWeekRecord, targetPayRate: number): StylistPerformance {
  const guaranteeRate = record.guaranteeRate;

  let production = 0;
  let actualHours = 0;
  let scheduledHoursTotal = 0;
  let scheduledHoursCompleted = 0;
  let remainingScheduledHours = 0;

  const daily: DailyPoint[] = [];
  const perDayRequired = pphForRate(targetPayRate);

  for (const d of record.days) {
    scheduledHoursTotal += d.scheduledHours;
    const upcoming = d.date > TEAM_TODAY;
    if (upcoming) {
      remainingScheduledHours += d.scheduledHours;
    } else {
      production += d.production;
      actualHours += d.actualHours;
      scheduledHoursCompleted += d.scheduledHours;
    }
    // Only include scheduled days in the mini trend.
    if (d.scheduledHours > 0) {
      daily.push({
        date: d.date,
        label: d.label,
        production: d.production,
        requiredProduction: perDayRequired * d.scheduledHours,
        scheduledHours: d.scheduledHours,
        actualHours: d.actualHours,
        haircuts: d.haircuts,
        colors: d.colors,
        upcoming,
      });
    }
  }

  const notStarted = scheduledHoursCompleted === 0 && production === 0;

  const pph = getPph(production, actualHours);
  const effectiveRate = getCurrentEffectivePayRate(production, actualHours, guaranteeRate);
  const rawTierRate = getEffectiveRateFromPph(pph, guaranteeRate, { applyGuarantee: false });
  const onGuarantee = actualHours > 0 && rawTierRate < guaranteeRate;
  const pay = effectiveRate * actualHours;

  const achievedTier = getAchievedTier(pph);
  const nextTier = getNextTier(effectiveRate);
  const tierProgress = getTierProgress(production, actualHours, guaranteeRate).fractionToNext;

  const utilization = scheduledHoursCompleted > 0 ? actualHours / scheduledHoursCompleted : 0;

  // Pace vs the target requirement for the hours already worked.
  const requiredSoFar = perDayRequired * actualHours;
  const paceRatio = requiredSoFar > 0 ? production / requiredSoFar : notStarted ? 0 : 1;

  // Over/short vs the full-week target requirement.
  const requiredTotalForTarget = getRequiredProductionForPayRate(scheduledHoursTotal, targetPayRate);
  const productionDelta = production - requiredSoFar;
  const pctOfTarget = requiredTotalForTarget > 0 ? production / requiredTotalForTarget : 1;

  const status: PerformanceStatus = classifyStatus({
    notStarted,
    effectiveRate,
    targetPayRate,
    paceRatio,
    utilization,
  });

  const remainingToTarget = remainingWork(targetPayRate, scheduledHoursTotal, production, remainingScheduledHours);
  const holdRate = Math.max(effectiveRate, guaranteeRate);
  const remainingToHold = remainingWork(holdRate, scheduledHoursTotal, production, remainingScheduledHours);

  return {
    id: record.id,
    stylistId: record.stylistId,
    name: record.name,
    firstName: record.name.split(" ")[0],
    initials: initialsOf(record.name),
    title: record.title,
    salonId: record.salonId,
    hue: record.hue,

    weekStart: record.weekStart,
    weekEnd: record.weekEnd,
    weekLabel: record.weekLabel,

    guaranteeRate,
    scheduledHours: scheduledHoursTotal,
    actualHours,
    remainingScheduledHours,
    utilization,

    production,
    pay,
    onGuarantee,

    pph,
    effectiveRate,

    achievedTier,
    nextTier,
    tierProgress,

    targetPayRate,
    status,
    productionDelta,
    pctOfTarget,

    remainingToTarget,
    remainingToHold,

    daily,
  };
}

function classifyStatus(args: {
  notStarted: boolean;
  effectiveRate: number;
  targetPayRate: number;
  paceRatio: number;
  utilization: number;
}): PerformanceStatus {
  const { notStarted, effectiveRate, targetPayRate, paceRatio, utilization } = args;
  const t = STATUS_THRESHOLDS;
  if (notStarted) return "needs_attention";
  if (effectiveRate >= targetPayRate || (paceRatio >= t.onTrackPace && utilization >= t.onTrackUtilization)) {
    return "on_track";
  }
  if (paceRatio < t.behindPace || utilization < t.behindUtilization) return "behind";
  return "needs_attention";
}

/** Effective-rate distribution bands for the KPI insight. */
const BANDS: Omit<RateBand, "count">[] = [
  { label: "≤ $14", min: 0, max: 14.999 },
  { label: "$15–17", min: 15, max: 17.999 },
  { label: "$18–20", min: 18, max: 20.999 },
  { label: "$21–24", min: 21, max: 24.999 },
  { label: "$25+", min: 25, max: Infinity },
];

/** Aggregate a set of derived performances into team KPIs. */
export function deriveTeamKPIs(perfs: StylistPerformance[]): TeamKPIs {
  const n = perfs.length;
  const totalProduction = perfs.reduce((a, p) => a + p.production, 0);
  const totalScheduledHours = perfs.reduce((a, p) => a + p.scheduledHours, 0);
  const totalActualHours = perfs.reduce((a, p) => a + p.actualHours, 0);
  // Scheduled hours that have already occurred, for a fair utilization roll-up.
  const scheduledSoFar = perfs.reduce((a, p) => a + (p.actualHours > 0 ? p.actualHours / (p.utilization || 1) : 0), 0);

  const rated = perfs.filter((p) => p.actualHours > 0);
  const avgEffectiveRate = rated.length ? rated.reduce((a, p) => a + p.effectiveRate, 0) / rated.length : 0;

  const distribution: RateBand[] = BANDS.map((b) => ({
    ...b,
    count: perfs.filter((p) => p.effectiveRate >= b.min && p.effectiveRate <= b.max).length,
  }));

  return {
    totalStylists: n,
    avgEffectiveRate,
    totalProduction,
    onTrackCount: perfs.filter((p) => p.status === "on_track").length,
    needsAttentionCount: perfs.filter((p) => p.status === "needs_attention").length,
    behindCount: perfs.filter((p) => p.status === "behind").length,
    teamUtilization: scheduledSoFar > 0 ? totalActualHours / scheduledSoFar : 0,
    totalScheduledHours,
    totalActualHours,
    distribution,
  };
}

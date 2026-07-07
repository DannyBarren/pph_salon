import { money, num, pct } from "./format";
import type { PerformanceStatus, StylistPerformance } from "./teamTypes";

/**
 * Human-readable coaching copy derived from a {@link StylistPerformance}. Keeps
 * all the "what does this stylist need to do" phrasing in one place so cards,
 * rows, and the detail modal stay consistent.
 */

export interface StatusMeta {
  label: string;
  /** Maps to the shared Badge `tone`. */
  tone: "success" | "warning" | "danger" | "neutral";
  /** Semantic key for icon selection / aria. */
  key: PerformanceStatus;
}

export function statusMeta(status: PerformanceStatus): StatusMeta {
  switch (status) {
    case "on_track":
      return { label: "On Track", tone: "success", key: status };
    case "needs_attention":
      return { label: "Needs Attention", tone: "warning", key: status };
    case "behind":
      return { label: "Behind", tone: "danger", key: status };
  }
}

const rt = (n: number) => `$${Number.isInteger(n) ? n : (Math.round(n * 100) / 100).toFixed(2)}`;

/** A short headline for the status badge, e.g. "On track for $20/hr". */
export function statusHeadline(p: StylistPerformance): string {
  if (p.actualHours === 0 && p.remainingScheduledHours > 0) {
    return `Not started · ${num(p.remainingScheduledHours)} hrs scheduled`;
  }
  switch (p.status) {
    case "on_track":
      return p.effectiveRate >= p.targetPayRate
        ? `On track at ${rt(p.effectiveRate)}/hr`
        : `On pace for ${rt(p.targetPayRate)}/hr`;
    case "needs_attention":
      return `Needs a push to reach ${rt(p.targetPayRate)}/hr`;
    case "behind":
      return p.onGuarantee ? `On guarantee ${rt(p.guaranteeRate)}/hr` : `Behind target ${rt(p.targetPayRate)}/hr`;
  }
}

/**
 * The actionable "what they need to do" line, respecting remaining hours.
 * e.g. "Need +$712 (~16 cuts + 5 colors) in 12 hrs to hit $19/hr".
 */
export function actionMessage(p: StylistPerformance): string {
  if (p.actualHours === 0 && p.remainingScheduledHours > 0) {
    return `Week hasn't started — ${num(p.remainingScheduledHours)} hrs scheduled to build toward ${rt(p.targetPayRate)}/hr.`;
  }

  const r = p.remainingToTarget;
  if (r.achieved) {
    const hold = p.remainingToHold;
    if (p.remainingScheduledHours <= 0) {
      return `Week complete at ${rt(p.effectiveRate)}/hr — target ${rt(p.targetPayRate)}/hr met.`;
    }
    return hold.remainingProduction > 0
      ? `Already at ${rt(p.targetPayRate)}/hr. Keep ${money(hold.remainingProduction)} coming to hold ${rt(p.effectiveRate)}/hr.`
      : `Ahead of target — locked in at ${rt(p.effectiveRate)}/hr with room to spare.`;
  }

  if (p.remainingScheduledHours <= 0) {
    return `Week finished ${money(Math.abs(p.productionDelta))} short of ${rt(p.targetPayRate)}/hr pace (${rt(p.effectiveRate)}/hr).`;
  }

  return `Need ${money(r.remainingProduction)} (~${num(r.remainingHaircuts)} cuts + ${num(
    r.remainingColors,
  )} colors) over ${num(r.remainingHours)} hrs to hit ${rt(p.targetPayRate)}/hr.`;
}

/** A compact utilization descriptor for tooltips / secondary text. */
export function utilizationNote(p: StylistPerformance): string {
  if (p.actualHours === 0) return "No hours worked yet";
  return `${pct(p.utilization)} of scheduled hours worked (${num(p.actualHours)}h of ${num(
    p.actualHours / (p.utilization || 1),
  )}h)`;
}

/** Color tone for an effective rate relative to target (green/yellow/red). */
export function rateTone(effectiveRate: number, targetPayRate: number): "success" | "warning" | "danger" {
  if (effectiveRate >= targetPayRate) return "success";
  if (effectiveRate >= targetPayRate - 2) return "warning";
  return "danger";
}

"use client";

import React from "react";
import { Clock, TrendingUp, Eye, Sliders, DollarSign } from "lucide-react";
import { Card, Avatar, Badge, Button } from "@/components/ui/primitives";
import { money, num, pct, rate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PerfView, StylistPerformance } from "@/lib/teamTypes";
import { actionMessage, rateTone, statusHeadline } from "@/lib/teamMessaging";
import { StatusBadge } from "./StatusBadge";
import { ProgressToNextTier } from "./ProgressToNextTier";
import { DailyMiniTrend } from "./DailyMiniTrend";

const RATE_TEXT: Record<"success" | "warning" | "danger", string> = {
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
};

const UTIL_TEXT = (u: number) =>
  u >= 0.85 ? "text-[var(--color-success)]" : u >= 0.7 ? "text-[var(--color-warning)]" : "text-[var(--color-danger)]";

/**
 * Rich, glanceable performance card for one stylist. Everything a manager needs
 * at a glance: effective rate, status, progress to next tier, the exact work
 * remaining, hours/utilization, production, and a daily trend.
 */
export function StylistCard({
  p,
  view,
  onDetails,
  onWhatIf,
}: {
  p: StylistPerformance;
  view: PerfView;
  onDetails: (p: StylistPerformance) => void;
  onWhatIf: (p: StylistPerformance) => void;
}) {
  const tone = rateTone(p.effectiveRate, p.targetPayRate);
  const productionValue = view === "scheduled" ? p.remainingToTarget.remainingProduction + p.production : p.production;
  const productionLabel = view === "scheduled" ? "Target Production" : "Production";

  return (
    <Card
      className="flex flex-col p-4 transition hover:shadow-md"
      role="article"
      aria-label={`${p.name}, ${statusHeadline(p)}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar initials={p.initials} hue={p.hue} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{p.name}</h3>
            <span className="shrink-0 text-[11px] text-[var(--color-ink-faint)] tabular-nums">#{p.stylistId}</span>
          </div>
          <div className="text-xs text-[var(--color-ink-faint)]">
            {p.title} · {p.weekLabel}
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>

      {/* Effective rate + tier */}
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            Effective Pay Rate
          </div>
          <div className={cn("text-3xl font-bold tabular-nums", RATE_TEXT[tone])}>
            {p.actualHours > 0 ? `${rate(p.effectiveRate)}` : "—"}
            <span className="text-base font-medium text-[var(--color-ink-faint)]">/hr</span>
          </div>
        </div>
        <div className="text-right">
          {p.onGuarantee ? (
            <Badge tone="warning">Guarantee ${p.guaranteeRate}</Badge>
          ) : p.achievedTier ? (
            <Badge tone="brand">PayRt {p.achievedTier.payRate}</Badge>
          ) : (
            <Badge tone="neutral">Below tier</Badge>
          )}
          <div className="mt-1 text-[11px] text-[var(--color-ink-faint)]">Target ${p.targetPayRate}/hr</div>
        </div>
      </div>

      {/* Progress to next tier */}
      <div className="mt-4">
        <ProgressToNextTier p={p} />
      </div>

      {/* Action message */}
      <p className="mt-3 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-[13px] leading-snug text-[var(--color-ink-soft)]">
        {actionMessage(p)}
      </p>

      {/* Stats row */}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <dt className="flex items-center justify-center gap-1 text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            <Clock size={11} aria-hidden="true" /> Hours
          </dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums">
            {num(p.actualHours)}
            <span className="text-xs font-normal text-[var(--color-ink-faint)]">/{num(p.scheduledHours)}h</span>
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <dt className="flex items-center justify-center gap-1 text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            <TrendingUp size={11} aria-hidden="true" /> Util
          </dt>
          <dd className={cn("mt-0.5 text-sm font-bold tabular-nums", UTIL_TEXT(p.utilization))}>
            {p.actualHours > 0 ? pct(p.utilization) : "—"}
          </dd>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] p-2">
          <dt className="flex items-center justify-center gap-1 text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
            <DollarSign size={11} aria-hidden="true" /> {productionLabel}
          </dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums">{money(productionValue)}</dd>
        </div>
      </dl>

      {/* Daily trend */}
      <div className="mt-4">
        <DailyMiniTrend daily={p.daily} />
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2 border-t border-[var(--color-border)] pt-4">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onDetails(p)}>
          <Eye size={15} aria-hidden="true" /> Details
        </Button>
        <Button variant="soft" size="sm" className="flex-1" onClick={() => onWhatIf(p)}>
          <Sliders size={15} aria-hidden="true" /> What If
        </Button>
      </div>
    </Card>
  );
}

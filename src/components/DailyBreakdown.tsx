"use client";

import React from "react";
import { Scissors, Palette, CalendarClock, DollarSign, Clock } from "lucide-react";
import type { DayRecord, PayConfig } from "@/lib/types";
import { Card, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/primitives";
import { fmtShort, isToday, weekdayIndex, WEEKDAY_LABELS } from "@/lib/time";
import { guaranteeRateFor } from "@/lib/payEngine";
import { salonById } from "@/lib/mockData";
import { servicePricesFor } from "@/lib/privacy";
import { money, num, rate } from "@/lib/format";
import { cn } from "@/lib/cn";

export function DailyBreakdown({
  days,
  salonId,
  config,
  goalRate = 0,
}: {
  days: DayRecord[];
  salonId: string;
  config: PayConfig;
  /**
   * The stylist's current effective-pay-rate goal ($/hr). Drives the per-day
   * dollar / haircut / color goal targets, so the bars re-scale live whenever
   * the goal changes on the dashboard.
   */
  goalRate?: number;
}) {
  const worked = days.filter((d) => d.scheduledHours > 0 || d.production > 0);
  const guarantee = guaranteeRateFor(salonId, config);
  const prices = servicePricesFor(salonById(salonId), config.salonServicePrices[salonId]);
  const mix = config.serviceMixHaircut;
  const commission = config.commissionRate > 0 ? config.commissionRate : 0.42;

  /** Per-day goal targets derived from the goal pay rate + that day's schedule. */
  function goalsFor(d: DayRecord) {
    // Production needed on this day to earn the goal rate over its scheduled hrs.
    const dollars = goalRate > 0 ? (goalRate * d.scheduledHours) / commission : 0;
    return {
      dollars,
      haircuts: prices.haircut > 0 ? (dollars * mix) / prices.haircut : 0,
      colors: prices.color > 0 ? (dollars * (1 - mix)) / prices.color : 0,
      hours: d.scheduledHours,
    };
  }

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle hint="daily goal vs actual · updates with your goal">Daily breakdown</SectionTitle>
      <div className="space-y-1.5">
        {worked.map((d) => {
          const isFuture = d.workedHours === 0 && d.production === 0;
          const dayRate = d.workedHours > 0 ? Math.max(d.production * commission, d.workedHours * guarantee) / d.workedHours : 0;
          const g = goalsFor(d);
          return (
            <div
              key={d.date}
              className={cn(
                "rounded-2xl px-3 py-2.5",
                isToday(d.date) ? "bg-[var(--color-brand-soft)]" : "hover:bg-[var(--color-surface-2)]",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 shrink-0 text-center">
                  <div className="text-xs font-semibold text-[var(--color-ink-soft)]">{WEEKDAY_LABELS[weekdayIndex(d.date)]}</div>
                  <div className="text-[11px] text-[var(--color-ink-faint)]">{fmtShort(d.date).split(" ")[1]}</div>
                </div>

                <div className="min-w-0 flex-1">
                  {isFuture ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--color-ink-faint)]">
                      <CalendarClock size={15} />
                      Scheduled · {d.scheduledHours}h
                      {isToday(d.date) && <Badge tone="brand">Today</Badge>}
                    </div>
                  ) : (
                    <div className="text-sm font-semibold tabular-nums text-[var(--color-ink-soft)]">
                      {money(d.production)} <span className="text-[11px] font-normal text-[var(--color-ink-faint)]">· {rate(dayRate)}/hr</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Per-day bars: dollars, haircuts, colors, hours — actual vs goal.
                  Vertically stacked with the numbers to the right so they read
                  cleanly on mobile. */}
              {!isFuture && (
                <div className="mt-2 space-y-1.5 pl-[3.75rem]">
                  <MetricBar icon={<DollarSign size={12} />} label="Dollars" actual={d.production} goal={g.dollars} color={METRIC_COLORS.dollars} format={(v) => money(v)} />
                  <MetricBar icon={<Scissors size={12} />} label="Haircuts" actual={d.haircuts} goal={g.haircuts} color={METRIC_COLORS.haircuts} format={(v) => num(v)} />
                  <MetricBar icon={<Palette size={12} />} label="Colors" actual={d.colors} goal={g.colors} color={METRIC_COLORS.colors} format={(v) => num(v)} />
                  <MetricBar icon={<Clock size={12} />} label="Hours" actual={d.workedHours} goal={g.hours} color={METRIC_COLORS.hours} format={(v) => `${Math.round(v * 10) / 10}h`} />
                </div>
              )}
            </div>
          );
        })}
        {worked.length === 0 && <div className="py-6 text-center text-sm text-[var(--color-ink-faint)]">No scheduled days in this range.</div>}
      </div>
    </Card>
  );
}

/** A distinct color per metric so the four bars are easy to tell apart. */
const METRIC_COLORS = {
  dollars: "var(--color-success)", // green
  haircuts: "var(--color-brand)", // purple
  colors: "#ec4899", // pink
  hours: "#f59e0b", // amber
} as const;

/**
 * One metric as a horizontal row: label on the left, the progress bar in the
 * middle (filling toward the day's goal in its own color), and the "actual /
 * goal" numbers on the right. Stacks cleanly on mobile.
 */
function MetricBar({
  icon,
  label,
  actual,
  goal,
  color,
  format,
}: {
  icon: React.ReactNode;
  label: string;
  actual: number;
  goal: number;
  color: string;
  format: (v: number) => string;
}) {
  const hasGoal = goal > 1e-9;
  const pct = hasGoal ? Math.max(0, Math.min(1, actual / goal)) : actual > 0 ? 1 : 0;
  return (
    <div className="flex items-center gap-2" title={`${label}: ${format(actual)} of ${hasGoal ? format(goal) : "—"} goal`}>
      <span className="flex w-14 shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)] sm:w-16">
        <span style={{ color }}>{icon}</span>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
      <span className="w-[5.5rem] shrink-0 text-right text-[11px] tabular-nums text-[var(--color-ink-soft)]">
        {format(actual)}
        {hasGoal && <span className="text-[var(--color-ink-faint)]"> / {format(goal)}</span>}
      </span>
    </div>
  );
}

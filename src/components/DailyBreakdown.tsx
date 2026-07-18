"use client";

import React from "react";
import { Scissors, Palette, CalendarClock, DollarSign, Clock } from "lucide-react";
import type { DayRecord, PayConfig } from "@/lib/types";
import { Card, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/primitives";
import { fmtShort, isToday, weekdayIndex, WEEKDAY_LABELS } from "@/lib/time";
import { guaranteeRateFor } from "@/lib/payEngine";
import { getCurrentEffectivePayRate, getRequiredProductionForPayRate } from "@/lib/tiers";
import { salonById } from "@/lib/mockData";
import { servicePricesFor } from "@/lib/privacy";
import { money, num, rate } from "@/lib/format";
import { cn } from "@/lib/cn";

export function DailyBreakdown({
  days,
  salonId,
  config,
  goalRate = 0,
  guaranteeRate,
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
  /** Per-employee guaranteed $/hr (falls back to the salon/global floor). */
  guaranteeRate?: number;
}) {
  const worked = days.filter((d) => d.scheduledHours > 0 || d.production > 0);
  const guarantee = guaranteeRate ?? guaranteeRateFor(salonId, config);
  const prices = servicePricesFor(salonById(salonId), config.salonServicePrices[salonId]);
  const mix = config.serviceMixHaircut;

  /** Per-day goal targets derived from the goal pay rate + that day's schedule. */
  function goalsFor(d: DayRecord) {
    // Production needed on this day to earn the goal rate over its scheduled hrs
    // (tiered PPH ladder — same math as the rest of the app).
    const dollars = goalRate > 0 ? getRequiredProductionForPayRate(d.scheduledHours, goalRate) : 0;
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
          const dayRate = getCurrentEffectivePayRate(d.production, d.workedHours, guarantee);
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

              {/* Per-day bars: dollars, haircuts, colors, hours — actual vs goal. */}
              {!isFuture && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 pl-[3.75rem] sm:grid-cols-4">
                  <MetricBar icon={<DollarSign size={12} />} label="Dollars" actual={d.production} goal={g.dollars} format={(v) => money(v)} />
                  <MetricBar icon={<Scissors size={12} />} label="Haircuts" actual={d.haircuts} goal={g.haircuts} format={(v) => num(v)} />
                  <MetricBar icon={<Palette size={12} />} label="Colors" actual={d.colors} goal={g.colors} format={(v) => num(v)} />
                  <MetricBar icon={<Clock size={12} />} label="Hours" actual={d.workedHours} goal={g.hours} format={(v) => `${Math.round(v * 10) / 10}h`} />
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

/**
 * A compact per-metric progress bar: fills toward the day's goal and turns green
 * once the goal is met (amber/brand while short). Shows "actual / goal".
 */
function MetricBar({
  icon,
  label,
  actual,
  goal,
  format,
}: {
  icon: React.ReactNode;
  label: string;
  actual: number;
  goal: number;
  format: (v: number) => string;
}) {
  const hasGoal = goal > 1e-9;
  const pct = hasGoal ? Math.max(0, Math.min(1, actual / goal)) : actual > 0 ? 1 : 0;
  const met = hasGoal ? actual >= goal - 1e-9 : actual > 0;
  return (
    <div title={`${label}: ${format(actual)} of ${hasGoal ? format(goal) : "—"} goal`}>
      <div className="mb-0.5 flex items-center justify-between gap-1 text-[10px]">
        <span className="inline-flex items-center gap-1 font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-[var(--color-ink-soft)]">
          {format(actual)}
          {hasGoal && <span className="text-[var(--color-ink-faint)]"> / {format(goal)}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct * 100}%`,
            background: met ? "var(--color-success)" : "var(--color-brand)",
          }}
        />
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { Scissors, Palette, CalendarClock } from "lucide-react";
import type { DayRecord, PayConfig } from "@/lib/types";
import { Card, Badge } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/primitives";
import { fmtShort, isToday, weekdayIndex, WEEKDAY_LABELS } from "@/lib/time";
import { guaranteeRateFor } from "@/lib/payEngine";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/cn";

export function DailyBreakdown({
  days,
  salonId,
  config,
  showMoney = true,
}: {
  days: DayRecord[];
  salonId: string;
  config: PayConfig;
  /** When false (stylist view), hide production $ totals — show services instead. */
  showMoney?: boolean;
}) {
  const worked = days.filter((d) => d.scheduledHours > 0 || d.production > 0);
  const maxProd = Math.max(1, ...worked.map((d) => d.production));
  const maxServices = Math.max(1, ...worked.map((d) => d.haircuts + d.colors));
  const guarantee = guaranteeRateFor(salonId, config);

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle hint={`${worked.length} scheduled days`}>Daily breakdown</SectionTitle>
      <div className="space-y-1.5">
        {worked.map((d) => {
          const isFuture = d.workedHours === 0 && d.production === 0;
          const dayRate = d.workedHours > 0 ? Math.max(d.production * config.commissionRate, d.workedHours * guarantee) / d.workedHours : 0;
          return (
            <div
              key={d.date}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5",
                isToday(d.date) ? "bg-[var(--color-brand-soft)]" : "hover:bg-[var(--color-surface-2)]",
              )}
            >
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
                  <>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 text-[var(--color-ink-soft)]">
                        <Scissors size={14} /> {num(d.haircuts)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[var(--color-ink-soft)]">
                        <Palette size={14} /> {num(d.colors)}
                      </span>
                      <span className="text-[var(--color-ink-faint)]">{d.workedHours}h</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-brand)]"
                        style={{
                          width: `${
                            showMoney
                              ? (d.production / maxProd) * 100
                              : ((d.haircuts + d.colors) / maxServices) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="w-20 shrink-0 text-right">
                {isFuture ? (
                  <span className="text-xs text-[var(--color-ink-faint)]">—</span>
                ) : (
                  <>
                    <div className="text-sm font-semibold tabular-nums">
                      {showMoney ? money(d.production) : `${num(d.haircuts + d.colors)} svc`}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-faint)] tabular-nums">${dayRate.toFixed(0)}/hr</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {worked.length === 0 && <div className="py-6 text-center text-sm text-[var(--color-ink-faint)]">No scheduled days in this range.</div>}
      </div>
    </Card>
  );
}

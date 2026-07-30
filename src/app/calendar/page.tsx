"use client";

import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Scissors } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { StylistSwitcher } from "@/components/StylistSwitcher";
import { WEEKS, CURRENT_WEEK } from "@/lib/time";
import { daysOfWeek, WEEKDAY_LABELS, fmtShort, isFuture, isToday } from "@/lib/time";
import { money } from "@/lib/format";
import { FeatureUnavailable } from "@/components/FeatureUnavailable";
import { ENABLE_CALENDAR } from "@/lib/featureFlags";

export default function CalendarPage() {
  // Soft-disabled (see featureFlags.ts). Set ENABLE_CALENDAR=true to re-enable.
  if (!ENABLE_CALENDAR) return <FeatureUnavailable title="Calendar" />;
  return <CalendarView />;
}

function CalendarView() {
  const { currentUser, viewedStylistId, getDays } = useApp();
  const [weekIdx, setWeekIdx] = useState(WEEKS.findIndex((w) => w.id === CURRENT_WEEK.id));
  const week = WEEKS[weekIdx];
  const stylistId = viewedStylistId ?? currentUser.id;

  const byDate = useMemo(() => {
    const map = new Map(getDays(stylistId).map((d) => [d.date, d]));
    return map;
  }, [getDays, stylistId]);

  const days = daysOfWeek(week);

  const totals = days.reduce(
    (acc, iso) => {
      const d = byDate.get(iso);
      if (d) {
        acc.scheduled += d.scheduledHours;
        acc.worked += d.workedHours;
        acc.services += d.haircuts + d.colors;
        acc.production += d.production;
      }
      return acc;
    },
    { scheduled: 0, worked: 0, services: 0, production: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays size={22} /> Calendar
          </h1>
          <p className="text-sm text-[var(--color-ink-faint)]">Your scheduled &amp; worked days for the week.</p>
        </div>
        {currentUser.role !== "stylist" && <StylistSwitcher />}
      </div>

      <Card>
        <CardBody>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
              disabled={weekIdx === 0}
              aria-label="Previous week"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold">{week.label}</span>
            <button
              onClick={() => setWeekIdx((i) => Math.min(WEEKS.length - 1, i + 1))}
              disabled={weekIdx === WEEKS.length - 1}
              aria-label="Next week"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {days.map((iso, i) => {
              const d = byDate.get(iso);
              const future = isFuture(iso);
              const today = isToday(iso);
              const off = !d || d.scheduledHours === 0;
              return (
                <div
                  key={iso}
                  className={`rounded-2xl border p-3 ${
                    today ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]" : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--color-ink-soft)]">{WEEKDAY_LABELS[i]}</span>
                    <span className="text-xs text-[var(--color-ink-faint)]">{fmtShort(iso)}</span>
                  </div>
                  {off ? (
                    <p className="mt-3 text-xs text-[var(--color-ink-faint)]">Day off</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock size={13} className="text-[var(--color-ink-faint)]" />
                        {future ? `${d!.scheduledHours}h sched` : `${d!.workedHours}/${d!.scheduledHours}h`}
                      </div>
                      {!future && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Scissors size={13} className="text-[var(--color-ink-faint)]" />
                          {d!.haircuts + d!.colors} services
                        </div>
                      )}
                      {!future && d!.production > 0 && (
                        <Badge tone="success">{money(d!.production)}</Badge>
                      )}
                      {future && <Badge tone="brand">Upcoming</Badge>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--color-border)] pt-4 text-sm">
            <span><b>{totals.worked.toFixed(1)}</b> / {totals.scheduled.toFixed(1)}h worked</span>
            <span><b>{totals.services}</b> services</span>
            <span><b>{money(totals.production)}</b> service total</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

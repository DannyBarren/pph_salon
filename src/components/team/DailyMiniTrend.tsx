"use client";

import React, { useId } from "react";
import type { DailyPoint } from "@/lib/teamTypes";
import { money } from "@/lib/format";

/**
 * Compact bar-per-day trend of actual production vs the required line to hold the
 * target rate. Upcoming days render muted. Purely presentational + accessible via
 * a descriptive summary for screen readers.
 */
export function DailyMiniTrend({ daily, height = 40 }: { daily: DailyPoint[]; height?: number }) {
  const titleId = useId();
  if (daily.length === 0) {
    return <div className="text-[11px] text-[var(--color-ink-faint)]">No scheduled days</div>;
  }
  const max = Math.max(1, ...daily.map((d) => Math.max(d.production, d.requiredProduction)));

  const summary = daily
    .filter((d) => !d.upcoming)
    .map((d) => `${d.label} ${money(d.production)}`)
    .join(", ");

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-labelledby={titleId}>
        {daily.map((d) => {
          const barH = (d.production / max) * height;
          const reqH = (d.requiredProduction / max) * height;
          const met = d.production >= d.requiredProduction;
          return (
            <div key={d.date} className="relative flex flex-1 flex-col items-center justify-end" style={{ height }}>
              {/* Required target marker */}
              <div
                className="absolute w-full border-t border-dashed border-[var(--color-ink-faint)]/60"
                style={{ bottom: Math.min(height, reqH) }}
                aria-hidden="true"
              />
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: Math.max(2, barH),
                  background: d.upcoming
                    ? "var(--color-surface-2)"
                    : met
                      ? "var(--color-success)"
                      : "var(--color-brand)",
                }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--color-ink-faint)]">
        {daily.map((d) => (
          <span key={d.date} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
      <span id={titleId} className="sr-only">
        Daily production: {summary || "none recorded yet"}. Dashed line marks the daily target.
      </span>
    </div>
  );
}

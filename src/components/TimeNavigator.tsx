"use client";

import React from "react";
import { CalendarRange } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { Segmented, Select } from "@/components/ui/primitives";
import { WEEKS, CURRENT_WEEK } from "@/lib/time";
import { payPeriods, resolveSelection } from "@/lib/selection";
import type { TimeView } from "@/lib/types";

const VIEW_OPTIONS: { value: TimeView; label: string }[] = [
  { value: "current-prior", label: "Current + Prior" },
  { value: "pay-period", label: "Pay Period" },
  { value: "single-week", label: "Single Week" },
];

export function TimeNavigator() {
  const { timeView, setTimeView, selectedWeekId, setSelectedWeekId, selectedPeriodIndex, setSelectedPeriodIndex } = useApp();
  const view = timeView === "planner" ? "current-prior" : timeView;
  const selection = resolveSelection(view, selectedWeekId, selectedPeriodIndex);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 overflow-x-auto">
        <Segmented options={VIEW_OPTIONS} value={view} onChange={(v) => setTimeView(v)} />
      </div>
      <div className="flex items-center gap-2">
        {view === "pay-period" && (
          <Select value={selectedPeriodIndex} onChange={(e) => setSelectedPeriodIndex(Number(e.target.value))}>
            {payPeriods().map((p) => (
              <option key={p.index} value={p.index}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
        {view === "single-week" && (
          <Select value={selectedWeekId} onChange={(e) => setSelectedWeekId(e.target.value)}>
            {[...WEEKS].reverse().map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
                {w.id === CURRENT_WEEK.id ? " · This week" : ""}
              </option>
            ))}
          </Select>
        )}
        <span className="hidden items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-2 text-xs font-medium text-[var(--color-ink-soft)] sm:flex">
          <CalendarRange size={14} />
          {selection.sublabel}
        </span>
      </div>
    </div>
  );
}

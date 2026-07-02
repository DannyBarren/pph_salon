import type { DayRecord, TimeView, Week } from "./types";
import { CURRENT_WEEK, WEEKS, fmtRange, weekById, weeksInPeriod } from "./time";

export interface Selection {
  weeks: Week[];
  start: string;
  end: string;
  label: string;
  sublabel: string;
}

/** Resolve the active time view + selectors into a concrete date range. */
export function resolveSelection(
  view: TimeView,
  selectedWeekId: string,
  selectedPeriodIndex: number,
): Selection {
  let weeks: Week[];
  let label: string;

  switch (view) {
    case "single-week": {
      weeks = [weekById(selectedWeekId)];
      label = "Single Week";
      break;
    }
    case "pay-period": {
      weeks = weeksInPeriod(selectedPeriodIndex);
      label = "Pay Period";
      break;
    }
    case "planner":
    case "current-prior":
    default: {
      // Last two weeks (this week + prior) — the live biweekly view.
      weeks = WEEKS.slice(-2);
      label = "Current + Prior";
      break;
    }
  }
  if (weeks.length === 0) weeks = [CURRENT_WEEK];
  const start = weeks[0].start;
  const end = weeks[weeks.length - 1].end;
  return { weeks, start, end, label, sublabel: fmtRange(start, end) };
}

export function sliceDays(days: DayRecord[], start: string, end: string): DayRecord[] {
  return days.filter((d) => d.date >= start && d.date <= end);
}

/** Distinct pay periods available, newest first, for selectors. */
export function payPeriods(): { index: number; label: string }[] {
  const indices = Array.from(new Set(WEEKS.map((w) => w.periodIndex)));
  return indices
    .sort((a, b) => b - a)
    .map((index) => {
      const ws = weeksInPeriod(index);
      return { index, label: fmtRange(ws[0].start, ws[ws.length - 1].end) };
    });
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Gauge, TrendingUp, Scale, RefreshCw, CalendarRange } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { userById, salonById } from "@/lib/mockData";
import { sliceDays, payPeriods } from "@/lib/selection";
import { CURRENT_WEEK, TODAY, daysOfWeek, weeksInPeriod, fmtRange } from "@/lib/time";
import type { DayRecord } from "@/lib/types";
import { canChangeDpr } from "@/lib/roles";
import { computeWeek, dprOptions, defaultDpr } from "@/lib/uatDashboard";
import { Card, CardBody, Select, SectionTitle } from "@/components/ui/primitives";
import { DailyBreakdown } from "@/components/DailyBreakdown";
import { money, moneyAcct, usDate } from "@/lib/format";
import { DEMO_MODE } from "@/lib/featureFlags";
import { performanceApi, salonApi } from "@/lib/api/endpoints";

/** One selectable week inside a pay period. */
interface WeekOpt {
  start: string;
  end: string;
  label: string;
}
/** A selectable pay period (a run of weeks). */
interface PeriodOpt {
  label: string;
  weeks: WeekOpt[];
}

/** Backend numeric stylist id from a frontend id ("u42" → 42), or null. */
function backendStylistId(frontendId: string): number | null {
  const m = /^u(\d+)$/.exec(frontendId);
  return m ? Number(m[1]) : null;
}

/** Demo pay periods from the deterministic time model (newest period first). */
function demoPeriods(): PeriodOpt[] {
  return payPeriods().map((p) => {
    const ws = weeksInPeriod(p.index);
    return {
      label: p.label,
      weeks: ws.map((w, i) => ({ start: w.start, end: w.end, label: `Week ${i + 1} · ${fmtRange(w.start, w.end)}` })),
    };
  });
}

/** Pick a sensible default week within a period: the one containing TODAY, else the last. */
function defaultWeekIdx(weeks: WeekOpt[]): number {
  const i = weeks.findIndex((w) => TODAY >= w.start && TODAY <= w.end);
  return i >= 0 ? i : Math.max(0, weeks.length - 1);
}

/** Smart dollars: whole numbers show no cents ("$14"), fractional show 2 ("$13.75"). */
function dollars(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}
/** Accounting-style smart dollars: negatives in parens, e.g. "($4)". */
function dollarsAcct(n: number): string {
  return n < 0 ? `(${dollars(Math.abs(n))})` : dollars(n);
}
/** Hours, up to 2 decimals, trailing zeros trimmed. */
function hrs(n: number): string {
  return `${Math.round(n * 100) / 100}`;
}

export function StylistDashboard({ stylistId }: { stylistId: string }) {
  const { config, getDays, currentUser } = useApp();
  // Demo profiles come from the baked-in mock directory. In the live app the
  // only reachable self-view is the signed-in stylist (managers/admins are
  // redirected to the Team Dashboard), whose profile arrives via /auth/me —
  // the mock directory must never be consulted (it would crash on unknown ids).
  const stylist = useMemo(() => {
    if (DEMO_MODE) return userById(stylistId);
    return currentUser.id === stylistId ? currentUser : undefined;
  }, [stylistId, currentUser]);

  // Live app: the salon name/city for the header come from the scoped salon
  // list (a stylist can read their own salon).
  const [liveSalon, setLiveSalon] = useState<{ name: string; city: string | null } | null>(null);
  useEffect(() => {
    if (DEMO_MODE || !stylist) return;
    let cancelled = false;
    const bid = Number(stylist.salonId.replace(/^s/, ""));
    salonApi
      .list()
      .then((salons) => {
        if (cancelled) return;
        const found = salons.find((s) => s.id === bid);
        setLiveSalon(found ? { name: found.name, city: found.city } : { name: "", city: null });
      })
      .catch(() => setLiveSalon({ name: "", city: null }));
    return () => {
      cancelled = true;
    };
  }, [stylist]);

  const salon = DEMO_MODE
    ? salonById(stylist?.salonId ?? "")
    : { name: liveSalon?.name ?? "", city: liveSalon?.city ?? "" };
  const guarantee = stylist?.guaranteeRate ?? config.guaranteeRate;
  // Who may change the Desired Pay Rate: Admin & SDL/Owner (for anyone), plus a
  // stylist on their OWN dashboard (personal what-if). Managers viewing a report
  // see it read-only.
  const dprEditable = currentUser.id === stylistId || canChangeDpr(currentUser.role);

  const options = dprOptions();
  const [dpr, setDpr] = useState<number>(() => defaultDpr(guarantee));

  // ── Historical pay-period + week selection ──────────────────────────────
  // Periods come from the deterministic time model in demo, or from the stored
  // history (Postgres via /performance) in the live app. Selecting a past period
  // then a week shows that week's data.
  const [periods, setPeriods] = useState<PeriodOpt[]>(() => (DEMO_MODE ? demoPeriods() : []));
  const [periodIdx, setPeriodIdx] = useState(0);
  const [weekIdx, setWeekIdx] = useState<number>(() =>
    DEMO_MODE ? defaultWeekIdx(demoPeriods()[0]?.weeks ?? []) : 0,
  );
  // Live-fetched days for the selected week (production only).
  const [liveDays, setLiveDays] = useState<DayRecord[] | null>(null);

  // Load the stored pay periods in the live app.
  useEffect(() => {
    if (DEMO_MODE) return;
    let cancelled = false;
    (async () => {
      try {
        const bid = backendStylistId(stylistId) ?? undefined;
        const dtos = await performanceApi.payPeriods(bid);
        if (cancelled) return;
        const mapped: PeriodOpt[] = dtos.map((p) => ({
          label: fmtRange(p.period_start, p.period_end),
          weeks: p.weeks.map((w, i) => ({
            start: w.week_start,
            end: w.week_end ?? w.week_start,
            label: `Week ${i + 1} · ${fmtRange(w.week_start, w.week_end ?? w.week_start)}`,
          })),
        }));
        // Fall back to the time-model periods so the selector always renders.
        const next = mapped.length > 0 ? mapped : demoPeriods();
        setPeriods(next);
        setPeriodIdx(0);
        setWeekIdx(defaultWeekIdx(next[0]?.weeks ?? []));
      } catch {
        const fallback = demoPeriods();
        setPeriods(fallback);
        setPeriodIdx(0);
        setWeekIdx(defaultWeekIdx(fallback[0]?.weeks ?? []));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stylistId]);

  const period = periods[periodIdx] ?? periods[0];
  const selWeek = period?.weeks[weekIdx] ?? period?.weeks[period.weeks.length - 1];
  const selStart = selWeek?.start;
  const selEnd = selWeek?.end;

  // Live app: fetch the selected week's stored data and map it to day records.
  useEffect(() => {
    if (DEMO_MODE || !selStart || !selEnd) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveDays(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const bid = backendStylistId(stylistId) ?? undefined;
        const wk = await performanceApi.week(selStart, bid);
        if (cancelled) return;
        const byDate = new Map(
          wk.daily.map((d) => [
            d.date,
            {
              date: d.date,
              scheduledHours: d.scheduled_hrs ?? 0,
              workedHours: d.actual_hrs ?? 0,
              haircuts: d.haircuts ?? 0,
              colors: d.colors ?? 0,
              production: d.actual_production ?? 0,
            } as DayRecord,
          ]),
        );
        setLiveDays(
          daysOfWeek({ id: selStart, start: selStart, end: selEnd, label: "", periodIndex: 0 }).map(
            (date) => byDate.get(date) ?? { date, scheduledHours: 0, workedHours: 0, haircuts: 0, colors: 0, production: 0 },
          ),
        );
      } catch {
        if (!cancelled) setLiveDays(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stylistId, selStart, selEnd]);

  const activeWeek = selWeek ?? { start: CURRENT_WEEK.start, end: CURRENT_WEEK.end };
  const activeStart = activeWeek.start;
  const activeEnd = activeWeek.end;

  // Build the full 7-day week (blank days included, like the spreadsheet).
  const weekDays: DayRecord[] = useMemo(() => {
    if (!DEMO_MODE && liveDays) return liveDays;
    const byDate = new Map(sliceDays(getDays(stylistId), activeStart, activeEnd).map((d) => [d.date, d]));
    return daysOfWeek({ id: activeStart, start: activeStart, end: activeEnd, label: "", periodIndex: 0 }).map(
      (date) => byDate.get(date) ?? { date, scheduledHours: 0, workedHours: 0, haircuts: 0, colors: 0, production: 0 },
    );
  }, [liveDays, getDays, stylistId, activeStart, activeEnd]);

  const { metrics, recap, gap, daily } = computeWeek(weekDays, dpr, guarantee);

  // Live app: the profile may still be loading (or the view was deep-linked for
  // another stylist, which only the Team Dashboard supports) — never crash.
  if (!stylist) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--color-ink-faint)]">Loading stylist profile…</p>
        </CardBody>
      </Card>
    );
  }

  // Excluded employees are not on the PPH pay plan — no personal dashboard.
  if (stylist.excluded) {
    return (
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">Not on the PPH pay plan</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            {stylist.name} is excluded from the PPH pay plan, so there is no personal PPH dashboard.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-transparent bg-gradient-to-br from-[var(--color-brand)] to-[#8b5bff] text-white">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white/80">{salon.name} · {salon.city}</div>
              <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">Hi {stylist.name.split(" ")[0]} 👋</h1>
              <p className="mt-1 text-sm text-white/85">
                Your guaranteed Pay Rate is <b>{dollars(guarantee)}/hr</b>
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/70 uppercase sm:justify-end">
                <CalendarRange size={12} /> Pay Period
              </div>
              {/* Historical pay-period + week pickers (select a past period to view it). */}
              <div className="mt-1.5 flex flex-col items-stretch gap-1.5 sm:items-end">
                <select
                  aria-label="Select pay period"
                  value={periodIdx}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setPeriodIdx(idx);
                    setWeekIdx(defaultWeekIdx(periods[idx]?.weeks ?? []));
                  }}
                  className="w-full min-w-[11rem] rounded-lg border border-white/30 bg-white/95 px-2.5 py-1.5 text-sm font-semibold text-[var(--color-ink)] outline-none sm:w-auto"
                >
                  {periods.map((p, i) => (
                    <option key={`${p.label}-${i}`} value={i}>
                      {p.label}
                      {i === 0 ? " · Latest" : ""}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Select week in pay period"
                  value={weekIdx}
                  onChange={(e) => setWeekIdx(Number(e.target.value))}
                  className="w-full min-w-[11rem] rounded-lg border border-white/30 bg-white/95 px-2.5 py-1.5 text-sm font-semibold text-[var(--color-ink)] outline-none sm:w-auto"
                >
                  {(period?.weeks ?? []).map((w, i) => (
                    <option key={w.start} value={i}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-white/60 sm:justify-end">
                <RefreshCw size={11} /> Showing {usDate(activeWeek.start)} – {usDate(activeWeek.end)}
              </div>
            </div>
          </div>

          {/* DPR selector + current pay rate */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white/95 p-3 text-[var(--color-ink)]">
            <label htmlFor="dpr-select" className="text-sm font-semibold">
              Desired Pay Rate (DPR)
            </label>
            {dprEditable ? (
              <Select id="dpr-select" value={String(dpr)} onChange={(e) => setDpr(Number(e.target.value))}>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {dollars(o)}/hr
                  </option>
                ))}
              </Select>
            ) : (
              <span
                className="rounded-full bg-[var(--color-surface-2)] px-3 py-1.5 text-sm font-semibold tabular-nums"
                title="Only your SDL/Owner or Admin can change the Desired Pay Rate"
              >
                {dollars(dpr)}/hr
              </span>
            )}
            <span className="text-sm text-[var(--color-ink-soft)]">
              Current Pay Rate <b className="tabular-nums text-[var(--color-ink)]">{dollars(recap.payRateAtPerf)}/hr</b>
            </span>
          </div>
        </div>
      </Card>

      {/* ── A. Metrics per Desired Pay Rate (DPR) for the week ──────────── */}
      <Card>
        <CardBody>
          <SectionTitle hint="What you're aiming for at the selected Desired Pay Rate">
            <span className="inline-flex items-center gap-2 normal-case">
              <Gauge size={16} className="text-[var(--color-brand)]" /> Metrics per Desired Pay Rate (DPR) for the week
            </span>
          </SectionTitle>
          <MetricGrid
            cells={[
              { label: "Desired Payrate (DPR)", value: dollars(metrics.dpr) },
              { label: "Sched. Hrs", value: hrs(metrics.schedHrs) },
              { label: "Req Svc Rev ($)", value: money(metrics.reqSvcRev, 2) },
              { label: "Req Svc Per Hr. (PPH)", value: dollars(metrics.reqPph) },
              { label: "Svcs Req", value: `${metrics.reqHaircuts} Haircuts or ${metrics.reqColors} Colors` },
              { label: "Svc Pay at DPR", value: money(metrics.svcPayAtDpr, 2) },
            ]}
          />
        </CardBody>
      </Card>

      {/* ── B. Recap (Where you stand) ─────────────────────────────────── */}
      <Card>
        <CardBody>
          <SectionTitle hint="Your current performance so far this week">
            <span className="inline-flex items-center gap-2 normal-case">
              <TrendingUp size={16} className="text-[var(--color-brand)]" /> Recap (Where you stand)
            </span>
          </SectionTitle>
          <MetricGrid
            cells={[
              { label: "Pay Rate at current Perf", value: dollars(recap.payRateAtPerf) },
              { label: "Hrs To Date", value: hrs(recap.hrsToDate) },
              { label: "Services To Date", value: money(recap.servicesToDate, 2) },
              { label: "Curr. PPH", value: money(recap.currPph, 2) },
              { label: "Curr Svcs", value: `${recap.currHaircuts} Haircuts & ${recap.currColors} Colors` },
              { label: "Potential Svc Pay", value: money(recap.potentialSvcPay, 2) },
            ]}
          />
        </CardBody>
      </Card>

      {/* ── C. Gap (Over / Under) ──────────────────────────────────────── */}
      <Card>
        <CardBody>
          <SectionTitle hint="Difference between where you stand and your DPR target">
            <span className="inline-flex items-center gap-2 normal-case">
              <Scale size={16} className="text-[var(--color-brand)]" /> Gap (Over / Under)
            </span>
          </SectionTitle>
          <MetricGrid
            cells={[
              { label: "Payrate", value: dollarsAcct(gap.payrate), tone: signTone(gap.payrate) },
              { label: "Hrs", value: hrs(gap.hrs), tone: signTone(gap.hrs) },
              { label: "Svcs ($)", value: moneyAcct(gap.svcRev, 2), tone: signTone(gap.svcRev) },
              { label: "PPH", value: moneyAcct(gap.pph, 2), tone: signTone(gap.pph) },
              { label: "Svcs", value: `${gap.haircuts} Haircuts & ${gap.colors} Colors`, tone: signTone(Math.min(gap.haircuts, gap.colors)) },
              { label: "Pay", value: moneyAcct(gap.pay, 2), tone: signTone(gap.pay) },
            ]}
          />
        </CardBody>
      </Card>

      {/* ── D. Daily Breakdown ─────────────────────────────────────────── */}
      <DailyBreakdown rows={daily} />
    </div>
  );
}

type Tone = "default" | "positive" | "negative";
function signTone(n: number): Tone {
  if (n > 1e-9) return "positive";
  if (n < -1e-9) return "negative";
  return "default";
}

function MetricGrid({ cells }: { cells: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="rounded-2xl bg-[var(--color-surface-2)] p-3">
          <div className="text-[11px] font-medium leading-tight tracking-wide text-[var(--color-ink-faint)] uppercase">
            {c.label}
          </div>
          <div
            className={`mt-1 text-lg font-bold tabular-nums ${
              c.tone === "positive"
                ? "text-[var(--color-success)]"
                : c.tone === "negative"
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-ink)]"
            }`}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

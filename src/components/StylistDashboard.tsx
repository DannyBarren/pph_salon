"use client";

import React, { useState } from "react";
import { Gauge, TrendingUp, Scale, RefreshCw } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { userById, salonById } from "@/lib/mockData";
import { sliceDays } from "@/lib/selection";
import { CURRENT_WEEK, TODAY, daysOfWeek, weeksInPeriod } from "@/lib/time";
import type { DayRecord } from "@/lib/types";
import { computeWeek, dprOptions, defaultDpr } from "@/lib/uatDashboard";
import { Card, CardBody, Select, SectionTitle } from "@/components/ui/primitives";
import { DailyBreakdown } from "@/components/DailyBreakdown";
import { money, moneyAcct, usDate } from "@/lib/format";

// The single pay period the stylist can see (current one). Oldest week first.
const PERIOD = weeksInPeriod(CURRENT_WEEK.periodIndex);
const DEFAULT_WEEK_IDX = (() => {
  const i = PERIOD.findIndex((w) => TODAY >= w.start && TODAY <= w.end);
  return i >= 0 ? i : PERIOD.length - 1;
})();

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
  const { config, getDays } = useApp();
  const stylist = userById(stylistId)!;
  const salon = salonById(stylist.salonId);
  const guarantee = stylist.guaranteeRate ?? config.guaranteeRate;

  const options = dprOptions();
  const [dpr, setDpr] = useState<number>(() => defaultDpr(guarantee));
  const [weekIdx, setWeekIdx] = useState<number>(DEFAULT_WEEK_IDX);

  const selWeek = PERIOD[weekIdx] ?? CURRENT_WEEK;
  const period = { start: PERIOD[0].start, end: PERIOD[PERIOD.length - 1].end };

  // Build the full 7-day week (blank days included, like the spreadsheet).
  const byDate = new Map(sliceDays(getDays(stylistId), selWeek.start, selWeek.end).map((d) => [d.date, d]));
  const weekDays: DayRecord[] = daysOfWeek(selWeek).map(
    (date) => byDate.get(date) ?? { date, scheduledHours: 0, workedHours: 0, haircuts: 0, colors: 0, production: 0 },
  );

  const { metrics, recap, gap, daily } = computeWeek(weekDays, dpr, guarantee);

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
              <div className="text-[11px] font-medium tracking-wide text-white/70 uppercase">Pay Period</div>
              <div className="text-sm font-semibold tabular-nums">
                {usDate(period.start)} to {usDate(period.end)}
              </div>
              <div className="mt-2 inline-flex rounded-full bg-white/15 p-0.5 text-[12px] font-semibold">
                {PERIOD.map((w, i) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWeekIdx(i)}
                    className={`rounded-full px-3 py-1 transition ${
                      i === weekIdx ? "bg-white text-[var(--color-brand-ink)]" : "text-white/80 hover:text-white"
                    }`}
                  >
                    Week {i + 1}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-white/60 sm:justify-end">
                <RefreshCw size={11} /> Last data refresh {usDate(TODAY)}
              </div>
            </div>
          </div>

          {/* DPR selector + current pay rate */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white/95 p-3 text-[var(--color-ink)]">
            <label htmlFor="dpr-select" className="text-sm font-semibold">
              Desired Pay Rate (DPR)
            </label>
            <Select id="dpr-select" value={String(dpr)} onChange={(e) => setDpr(Number(e.target.value))}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {dollars(o)}/hr
                </option>
              ))}
            </Select>
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

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, Scissors, Palette, Clock, Gauge, Target, TrendingUp, Zap } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { salonById, userById } from "@/lib/mockData";
import { sliceDays } from "@/lib/selection";
import { CURRENT_WEEK, weeksInPeriod, fmtRange } from "@/lib/time";
import { guaranteeRateFor, plan, summarize } from "@/lib/payEngine";
import { Card, CardBody, Badge, Segmented, Slider, ProgressRing } from "@/components/ui/primitives";
import { money, num, rate, pct } from "@/lib/format";
import { cn } from "@/lib/cn";

type Scope = "week" | "period";

export function WhatIfPlanner({ stylistId }: { stylistId: string }) {
  const { config, getDays } = useApp();
  const stylist = userById(stylistId)!;
  const salon = salonById(stylist.salonId);
  const guarantee = guaranteeRateFor(stylist.salonId, config);

  const [scope, setScope] = useState<Scope>("period");
  const [targetRate, setTargetRate] = useState<number>(guarantee + 12);
  const [extraHours, setExtraHours] = useState<number>(0);
  const [serviceFocus, setServiceFocus] = useState<number>(config.serviceMixHaircut);

  const { summary, scopeLabel } = useMemo(() => {
    const all = getDays(stylistId);
    if (scope === "week") {
      const days = sliceDays(all, CURRENT_WEEK.start, CURRENT_WEEK.end);
      return { summary: summarize(days, stylist.salonId, config), scopeLabel: fmtRange(CURRENT_WEEK.start, CURRENT_WEEK.end) };
    }
    const weeks = weeksInPeriod(CURRENT_WEEK.periodIndex);
    const days = sliceDays(all, weeks[0].start, weeks[weeks.length - 1].end);
    return { summary: summarize(days, stylist.salonId, config), scopeLabel: fmtRange(weeks[0].start, weeks[weeks.length - 1].end) };
  }, [scope, getDays, stylistId, stylist.salonId, config]);

  const result = useMemo(
    () => plan(summary, config, { targetRate, extraHours, serviceMixHaircut: serviceFocus }, guarantee),
    [summary, config, targetRate, extraHours, serviceFocus, guarantee],
  );

  // Reset to a sensible default target whenever the stylist or scope changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const suggested = Math.max(guarantee + 4, Math.round((result.pacedRate + 2) * 2) / 2);
    setTargetRate(suggested);
    setExtraHours(0);
    setServiceFocus(config.serviceMixHaircut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stylistId, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const feas = result.feasibility;
  const verdict =
    result.belowGuarantee
      ? { label: "Guaranteed", tone: "success" as const, msg: "At or below your guarantee — locked in no matter what." }
      : feas >= 1
        ? { label: "On track", tone: "success" as const, msg: "Very achievable at your normal pace." }
        : feas >= 0.7
          ? { label: "A stretch", tone: "warning" as const, msg: "Doable with a focused push on the remaining days." }
          : { label: "Ambitious", tone: "danger" as const, msg: "You'll likely need extra hours or higher tickets." };

  const remainingPerDayServices = result.remainingDays > 0 ? result.projectedServices / result.remainingDays : result.projectedServices;
  const maxRate = Math.round(guarantee + 40);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-transparent bg-gradient-to-br from-[#1d1340] via-[var(--color-brand)] to-[#8b5bff] text-white">
        <div className="flex flex-col gap-1 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-white/85">
            <Sparkles size={16} /> What-If Planner
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Plan {stylist.name.split(" ")[0]}&apos;s next move</h1>
          <p className="text-sm text-white/80">{salon.name} · scenarios update live and aren&apos;t saved.</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Controls */}
        <Card>
          <CardBody className="space-y-6">
            <div className="flex items-center justify-between gap-2">
              <Segmented
                options={[
                  { value: "week", label: "This Week" },
                  { value: "period", label: "Pay Period" },
                ]}
                value={scope}
                onChange={(v) => setScope(v)}
              />
              <span className="text-xs text-[var(--color-ink-faint)]">{scopeLabel}</span>
            </div>

            {/* Target rate slider */}
            <div>
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Target size={16} className="text-[var(--color-brand)]" /> Target effective pay rate
                  </div>
                  <div className="text-xs text-[var(--color-ink-faint)]">Drag to set your goal $/hr</div>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-[var(--color-brand)] tabular-nums">{rate(targetRate)}</span>
                  <span className="text-sm text-[var(--color-ink-faint)]">/hr</span>
                </div>
              </div>
              <Slider value={targetRate} min={guarantee} max={maxRate} step={0.5} onChange={setTargetRate} />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--color-ink-faint)]">
                <span>Guarantee {rate(guarantee)}</span>
                <span>Pace {rate(result.pacedRate)}</span>
                <span>{rate(maxRate)}</span>
              </div>
            </div>

            {/* Extra hours */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Clock size={16} className="text-[var(--color-brand)]" /> Extra hours added
                </div>
                <span className="text-lg font-bold tabular-nums">+{extraHours}h</span>
              </div>
              <Slider value={extraHours} min={0} max={16} step={1} onChange={setExtraHours} />
            </div>

            {/* Service focus */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Gauge size={16} className="text-[var(--color-brand)]" /> Service focus
                </div>
                <span className="text-sm font-medium text-[var(--color-ink-soft)]">
                  {pct(serviceFocus)} cuts · {pct(1 - serviceFocus)} color
                </span>
              </div>
              <Slider value={serviceFocus} min={0.1} max={0.9} step={0.05} onChange={setServiceFocus} />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--color-ink-faint)]">
                <span className="inline-flex items-center gap-1"><Scissors size={11} /> Haircuts</span>
                <span className="inline-flex items-center gap-1"><Palette size={11} /> Colors</span>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-ink-soft)]">
              Avg ticket in this plan: <b>{money(result.avgTicket)}</b> · driven by admin config
              ({money(config.avgTicketHaircut)} cut / {money(config.avgTicketColor)} color · {pct(config.commissionRate)} commission).
            </div>
          </CardBody>
        </Card>

        {/* Results */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">To hit {rate(targetRate)}/hr you need…</h2>
              <Badge tone={verdict.tone}>{verdict.label}</Badge>
            </div>

            <div className="flex items-center gap-4 rounded-2xl bg-[var(--color-surface-2)] p-4">
              <ProgressRing value={summary.productionToDate / Math.max(1, result.requiredProduction)} size={104} stroke={11}>
                <span className="text-[10px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">Done</span>
                <span className="text-lg font-bold tabular-nums">
                  {Math.round((summary.productionToDate / Math.max(1, result.requiredProduction)) * 100)}%
                </span>
              </ProgressRing>
              <div className="flex-1">
                <div className="text-xs text-[var(--color-ink-faint)]">Production still needed</div>
                <div className="text-3xl font-bold tabular-nums">{money(result.remainingProduction)}</div>
                <div className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  of {money(result.requiredProduction)} target · {money(summary.productionToDate)} banked
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Result icon={<TrendingUp size={14} />} label="Per working day" value={money(result.perDayProduction)} sub={`${result.remainingDays} days left`} />
              <Result icon={<Zap size={14} />} label="Services / day" value={num(remainingPerDayServices)} sub={`${num(result.projectedServices)} total`} />
              <Result icon={<Scissors size={14} />} label="Haircuts to go" value={num(result.projectedHaircuts)} sub={`${num(result.projectedHaircuts / Math.max(1, result.remainingDays))}/day`} />
              <Result icon={<Palette size={14} />} label="Colors to go" value={num(result.projectedColors)} sub={`${num(result.projectedColors / Math.max(1, result.remainingDays))}/day`} />
            </div>

            {/* Feasibility meter */}
            <div>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-medium text-[var(--color-ink-soft)]">Feasibility</span>
                <span className="text-[var(--color-ink-faint)]">{verdict.msg}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    feas >= 1 ? "bg-[var(--color-success)]" : feas >= 0.7 ? "bg-[var(--color-warning)]" : "bg-[var(--color-danger)]",
                  )}
                  style={{ width: `${Math.min(100, (feas / 1.2) * 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-brand-soft)] bg-[var(--color-brand-soft)] p-3 text-sm text-[var(--color-brand-ink)]">
              <b>Flash goal:</b>{" "}
              {result.remainingProduction <= 0
                ? "You've already locked this rate in — set the bar higher!"
                : `Book about ${num(Math.ceil(remainingPerDayServices))} services tomorrow to stay on track for ${rate(targetRate)}/hr.`}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Result({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] p-3">
      <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-[var(--color-ink-faint)]">{sub}</div>
    </div>
  );
}

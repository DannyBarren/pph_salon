"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Scissors, Palette, Clock, DollarSign, TrendingUp, Target, Flame, Trophy, Sliders, ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { userById, salonById, USAGE } from "@/lib/mockData";
import { resolveSelection, sliceDays } from "@/lib/selection";
import { summarize, guaranteeRateFor, plan } from "@/lib/payEngine";
import { Card, CardBody, Badge, ProgressRing, Progress } from "@/components/ui/primitives";
import { DailyBreakdown } from "@/components/DailyBreakdown";
import { money, num, rate } from "@/lib/format";

function roundUpTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

export function StylistDashboard({ stylistId }: { stylistId: string }) {
  const { config, timeView, selectedWeekId, selectedPeriodIndex, getDays } = useApp();
  const stylist = userById(stylistId)!;
  const salon = salonById(stylist.salonId);
  const usage = USAGE[stylistId];

  const { summary, periodDays, guarantee, suggestedGoalRate, paceRate } = useMemo(() => {
    const view = timeView === "planner" ? "current-prior" : timeView;
    const sel = resolveSelection(view, selectedWeekId, selectedPeriodIndex);
    const all = getDays(stylistId);
    const periodDays = sliceDays(all, sel.start, sel.end);
    // Prefer the employee's own guaranteed rate (from the client roster);
    // fall back to the salon/global config floor.
    const guarantee = stylist.guaranteeRate ?? guaranteeRateFor(stylist.salonId, config);
    const summary = summarize(periodDays, stylist.salonId, config, guarantee);
    const probe = plan(summary, config, { targetRate: guarantee, extraHours: 0, serviceMixHaircut: config.serviceMixHaircut }, guarantee);
    const paceRate = probe.pacedRate;
    const suggestedGoalRate = Math.max(roundUpTo(Math.max(paceRate + 1, summary.effectiveRate + 2), 2), guarantee + 4);
    return { summary, periodDays, guarantee, suggestedGoalRate, paceRate };
  }, [config, timeView, selectedWeekId, selectedPeriodIndex, getDays, stylistId, stylist.salonId, stylist.guaranteeRate]);

  // The stylist can override the suggested goal with their own $/hr target
  // (§3). Null means "use the app's suggestion"; any number is their own goal.
  const [customGoalRate, setCustomGoalRate] = useState<number | null>(null);
  const goalRate = customGoalRate ?? suggestedGoalRate;
  const goalIsCustom = customGoalRate != null;

  // Recompute the "what you still need" plan against whichever goal is active so
  // manual goal changes update every number immediately.
  const goalPlan = useMemo(
    () => plan(summary, config, { targetRate: goalRate, extraHours: 0, serviceMixHaircut: config.serviceMixHaircut }, guarantee),
    [summary, config, goalRate, guarantee],
  );

  const ringValue = goalRate > 0 ? summary.effectiveRate / goalRate : 0;
  const cleared = goalPlan.remainingProduction <= 0;
  const periodComplete = summary.remainingDays === 0 && summary.completedDays > 0;
  const avgPerDay = summary.completedDays > 0 ? summary.productionToDate / summary.completedDays : 0;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="overflow-hidden border-transparent bg-gradient-to-br from-[var(--color-brand)] to-[#8b5bff] text-white">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white/80">{salon.name} · {salon.city}</div>
              <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">Hi {stylist.name.split(" ")[0]} 👋</h1>
              <p className="mt-1 max-w-md text-sm text-white/85">
                {periodComplete
                  ? `This period is wrapped — you finished at ${rate(summary.effectiveRate)}/hr across ${num(summary.workedHours)} hours.`
                  : cleared
                    ? "You've already cleared your goal for this period. Stack a little extra to widen the gap."
                    : `On pace to finish around ${rate(paceRate)}/hr. About ${money(goalPlan.remainingProduction)} more in services gets you to ${rate(goalRate)}/hr.`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-white/20 text-white">
                  <Flame size={13} /> {usage.streak}-day streak
                </Badge>
                <Badge className="bg-white/20 text-white">
                  <Trophy size={13} /> {usage.goalsHit} goals hit
                </Badge>
                {summary.onGuarantee ? (
                  <Badge className="bg-white/20 text-white">
                    <ShieldCheck size={13} /> On guarantee
                  </Badge>
                ) : (
                  <Badge className="bg-white/20 text-white">
                    <TrendingUp size={13} /> Commission
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              {/* §3 — interactive Hourly Pay Rate goal box */}
              <PayRateGoalBox
                goalRate={goalRate}
                goalIsCustom={goalIsCustom}
                onChange={setCustomGoalRate}
                weekRate={summary.effectiveRate}
                dayRate={lastCompletedDayRate(periodDays, guarantee, config.commissionRate)}
              />

              <div
                className="flex shrink-0 items-center justify-center"
                title="Your goal — set it yourself in the Hourly Pay Rate Goal box. The starting value is suggested from your current pace and guarantee."
              >
                <ProgressRing value={ringValue} tone="#ffffff" size={148} stroke={13}>
                  <span className="text-[11px] font-medium tracking-wide text-white/80 uppercase">Current</span>
                  <span className="text-3xl font-bold tabular-nums">{rate(summary.effectiveRate)}</span>
                  <span className="text-xs text-white/80">goal {rate(goalRate)}/hr</span>
                </ProgressRing>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Current Week / Current Pay Period — summary boxes (§4, §6, §7, §8) */}
      <Card>
        <CardBody>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">Current Week / Current Pay Period</h2>
            <span className="text-xs text-[var(--color-ink-faint)]">{num(summary.completedDays)} days worked</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryBox
              label="Projected Hourly to Date"
              value={`${rate(summary.effectiveRate)}/hr`}
              sub={`Guarantee ${rate(guarantee)}/hr`}
              icon={<DollarSign size={13} />}
            />
            <SummaryBox
              label="Projected Hourly at End of Week"
              value={`${rate(paceRate)}/hr`}
              sub="projected finish"
              icon={<TrendingUp size={13} />}
            />
            <SummaryBox
              label="Hours Worked"
              value={`${num(summary.workedHours)}h`}
              sub={`${num(summary.remainingScheduledHours)}h scheduled left`}
              icon={<Clock size={13} />}
            />
            <SummaryBox
              label="Service Total to Date"
              value={money(summary.productionToDate)}
              sub={`${num(summary.haircuts)} cuts · ${num(summary.colors)} colors`}
              icon={<Scissors size={13} />}
            />
          </div>
        </CardBody>
      </Card>

      {/* What you still need */}
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Target size={18} className="text-[var(--color-brand)]" />
                <h2 className="text-base font-semibold">{periodComplete ? "Period recap" : "What you still need"}</h2>
              </div>
              <p className="mt-0.5 text-sm text-[var(--color-ink-faint)]">
                {periodComplete ? `Completed period · final rate ${rate(summary.effectiveRate)}/hr` : `To finish this period at ${rate(goalRate)}/hr`}
              </p>
            </div>
            <Badge tone={periodComplete ? "neutral" : cleared ? "success" : "brand"}>
              {periodComplete ? "Complete" : `${summary.remainingDays} days left`}
            </Badge>
          </div>

          {periodComplete ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Service total" value={money(summary.productionToDate)} />
              <MiniStat label="Avg per day" value={money(avgPerDay)} />
              <MiniStat label="Haircuts" value={num(summary.haircuts)} icon={<Scissors size={13} />} />
              <MiniStat label="Colors" value={num(summary.colors)} icon={<Palette size={13} />} />
            </div>
          ) : cleared ? (
            <div className="mt-4 rounded-2xl bg-[var(--color-success-soft)] p-4 text-sm text-[var(--color-success)]">
              🎉 Goal cleared — you&apos;re already at or above {rate(goalRate)}/hr. Keep the momentum going!
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* §9, §10 — dollar amounts instead of service counts */}
                <MiniStat label="Service $ to go" value={money(goalPlan.remainingProduction)} />
                <MiniStat label="Service $ / day" value={money(goalPlan.perDayProduction)} />
                <MiniStat label="Haircuts / day" value={num(goalPlan.projectedHaircuts / Math.max(1, goalPlan.remainingDays))} icon={<Scissors size={13} />} />
                <MiniStat label="Colors / day" value={num(goalPlan.projectedColors / Math.max(1, goalPlan.remainingDays))} icon={<Palette size={13} />} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-[var(--color-ink-faint)]">
                  <span>Progress to {rate(goalRate)}/hr goal ({money(goalPlan.targetPay)})</span>
                  <span>{Math.round((summary.productionToDate / Math.max(1, goalPlan.requiredProduction)) * 100)}%</span>
                </div>
                <Progress value={summary.productionToDate / Math.max(1, goalPlan.requiredProduction)} />
              </div>
            </>
          )}

          {/* §3 — the interactive goal box above covers most planning, so the
              What-If planner is de-emphasized to a subtle secondary link. */}
          <Link
            href="/planner"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-faint)] underline-offset-2 hover:text-[var(--color-brand)] hover:underline"
          >
            <Sliders size={14} /> Open the full What-If planner <ArrowRight size={14} />
          </Link>
        </CardBody>
      </Card>

      <DailyBreakdown days={periodDays} salonId={stylist.salonId} config={config} goalRate={goalRate} guaranteeRate={guarantee} />
    </div>
  );
}

/** Effective $/hr of the most recent completed day (for the "Day" goal view). */
function lastCompletedDayRate(
  days: { workedHours: number; production: number }[],
  guarantee: number,
  commissionRate: number,
): number {
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.workedHours > 0 || d.production > 0) {
      if (d.workedHours <= 0) return 0;
      return Math.max(d.production * commissionRate, d.workedHours * guarantee) / d.workedHours;
    }
  }
  return 0;
}

/**
 * §3 — Interactive Hourly Pay Rate goal setter. Lets the stylist type their own
 * daily or weekly $/hr goal and instantly see goal-vs-actual progress with a
 * bar, color coding and a plain-language difference line.
 */
function PayRateGoalBox({
  goalRate,
  goalIsCustom,
  onChange,
  weekRate,
  dayRate,
}: {
  goalRate: number;
  goalIsCustom: boolean;
  onChange: (value: number | null) => void;
  weekRate: number;
  dayRate: number;
}) {
  const [scope, setScope] = useState<"week" | "day">("week");
  // Keep an editable text draft so typing decimals (e.g. "28.5") stays smooth
  // instead of being reformatted on every render.
  const [draft, setDraft] = useState(() => String(Number(goalRate.toFixed(2))));
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const parsed = draft === "" ? NaN : Number(draft);
    if (!(Math.abs((Number.isFinite(parsed) ? parsed : NaN) - goalRate) < 1e-9)) {
      setDraft(String(Number(goalRate.toFixed(2))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalRate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const actual = scope === "week" ? weekRate : dayRate;
  const diff = actual - goalRate;
  const onTrack = diff >= 0;
  const progress = goalRate > 0 ? Math.max(0, Math.min(1, actual / goalRate)) : 0;

  return (
    <div className="w-full rounded-2xl bg-white/15 p-4 sm:w-64">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-white/80 uppercase">Hourly Pay Rate Goal</span>
        <div className="flex rounded-full bg-white/15 p-0.5 text-[11px] font-semibold">
          {(["week", "day"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`rounded-full px-2 py-0.5 capitalize transition ${scope === s ? "bg-white text-[var(--color-brand-ink)]" : "text-white/80 hover:text-white"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center rounded-xl bg-white/20 px-3 py-2">
        <span className="text-lg font-bold text-white">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            onChange(v === "" ? null : Math.max(0, Number(v)));
          }}
          aria-label="Hourly pay rate goal"
          className="w-full min-w-0 bg-transparent px-1 text-lg font-bold text-white outline-none placeholder:text-white/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-sm text-white/80">/hr</span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white transition-all duration-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
            onTrack ? "bg-emerald-400/30 text-emerald-50" : "bg-amber-400/30 text-amber-50"
          }`}
        >
          {onTrack ? "▲" : "▼"} {rate(Math.abs(diff))}/hr {onTrack ? "ahead" : "behind"}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-white/75">
        {scope === "week" ? "This week to date " : "Latest day "}
        {rate(actual)}/hr vs your {rate(goalRate)}/hr goal.
        {goalIsCustom ? "" : " Tap to set your own."}
      </p>
    </div>
  );
}

function SummaryBox({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
      <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
      <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

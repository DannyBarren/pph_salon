"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Scissors, Palette, Clock, DollarSign, TrendingUp, Target, Flame, Trophy, Sliders, ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { userById, salonById, USAGE } from "@/lib/mockData";
import { resolveSelection, sliceDays } from "@/lib/selection";
import { summarize, guaranteeRateFor, plan } from "@/lib/payEngine";
import { Card, CardBody, Badge, ProgressRing, Button, Progress } from "@/components/ui/primitives";
import { Stat } from "@/components/Stat";
import { DailyBreakdown } from "@/components/DailyBreakdown";
import { money, num, rate } from "@/lib/format";
import { canSeeMoney } from "@/lib/privacy";

function roundUpTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

export function StylistDashboard({ stylistId }: { stylistId: string }) {
  const { config, timeView, selectedWeekId, selectedPeriodIndex, getDays, currentUser } = useApp();
  // Privacy (spec §4): stylists never see revenue/production $. Managers do.
  const showMoney = canSeeMoney(currentUser.role);
  const stylist = userById(stylistId)!;
  const salon = salonById(stylist.salonId);
  const usage = USAGE[stylistId];

  const { summary, periodDays, guarantee, goalRate, goalPlan, paceRate } = useMemo(() => {
    const view = timeView === "planner" ? "current-prior" : timeView;
    const sel = resolveSelection(view, selectedWeekId, selectedPeriodIndex);
    const all = getDays(stylistId);
    const periodDays = sliceDays(all, sel.start, sel.end);
    const guarantee = guaranteeRateFor(stylist.salonId, config);
    const summary = summarize(periodDays, stylist.salonId, config);
    const probe = plan(summary, config, { targetRate: guarantee, extraHours: 0, serviceMixHaircut: config.serviceMixHaircut }, guarantee);
    const paceRate = probe.pacedRate;
    const goalRate = Math.max(roundUpTo(Math.max(paceRate + 1, summary.effectiveRate + 2), 2), guarantee + 4);
    const goalPlan = plan(summary, config, { targetRate: goalRate, extraHours: 0, serviceMixHaircut: config.serviceMixHaircut }, guarantee);
    return { summary, periodDays, guarantee, goalRate, goalPlan, paceRate };
  }, [config, timeView, selectedWeekId, selectedPeriodIndex, getDays, stylistId, stylist.salonId]);

  const ringValue = goalRate > 0 ? summary.effectiveRate / goalRate : 0;
  const services = summary.haircuts + summary.colors;
  const cleared = goalPlan.remainingProduction <= 0;
  const periodComplete = summary.remainingDays === 0 && summary.completedDays > 0;
  const avgPerDay = summary.completedDays > 0 ? summary.productionToDate / summary.completedDays : 0;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="overflow-hidden border-transparent bg-gradient-to-br from-[var(--color-brand)] to-[#8b5bff] text-white">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="text-sm font-medium text-white/80">{salon.name} · {salon.city}</div>
            <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">Hi {stylist.name.split(" ")[0]} 👋</h1>
            <p className="mt-1 max-w-md text-sm text-white/85">
              {periodComplete
                ? `This period is wrapped — you finished at ${rate(summary.effectiveRate)}/hr across ${num(summary.workedHours)} hours.`
                : cleared
                  ? "You've already cleared your goal for this period. Stack a little extra to widen the gap."
                  : showMoney
                    ? `On pace to finish around ${rate(paceRate)}/hr. A push of ${money(goalPlan.remainingProduction)} gets you to ${rate(goalRate)}/hr.`
                    : `On pace to finish around ${rate(paceRate)}/hr. About ${num(goalPlan.projectedServices)} more services gets you to ${rate(goalRate)}/hr.`}
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

          <div className="flex shrink-0 items-center justify-center">
            <ProgressRing value={ringValue} tone="#ffffff" size={148} stroke={13}>
              <span className="text-[11px] font-medium tracking-wide text-white/80 uppercase">Effective</span>
              <span className="text-3xl font-bold tabular-nums">{rate(summary.effectiveRate)}</span>
              <span className="text-xs text-white/80">goal {rate(goalRate)}/hr</span>
            </ProgressRing>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Effective rate" value={`${rate(summary.effectiveRate)}/hr`} sub={`Guarantee ${rate(guarantee)}/hr`} icon={<DollarSign size={16} />} tone="brand" />
        {showMoney ? (
          <Stat label="Production" value={money(summary.productionToDate)} sub={`${money(summary.pay)} earned`} icon={<TrendingUp size={16} />} />
        ) : (
          <Stat label="Pace" value={`${rate(paceRate)}/hr`} sub="projected finish" icon={<TrendingUp size={16} />} />
        )}
        <Stat label="Hours worked" value={`${num(summary.workedHours)}h`} sub={`${summary.remainingScheduledHours}h scheduled left`} icon={<Clock size={16} />} />
        <Stat label="Services" value={num(services)} sub={`${num(summary.haircuts)} cuts · ${num(summary.colors)} colors`} icon={<Scissors size={16} />} />
      </div>

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
              {showMoney ? (
                <>
                  <MiniStat label="Total production" value={money(summary.productionToDate)} />
                  <MiniStat label="Avg per day" value={money(avgPerDay)} />
                </>
              ) : (
                <>
                  <MiniStat label="Total services" value={num(services)} />
                  <MiniStat label="Avg per day" value={num(summary.completedDays > 0 ? services / summary.completedDays : 0)} />
                </>
              )}
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
                {showMoney ? (
                  <>
                    <MiniStat label="More production" value={money(goalPlan.remainingProduction)} />
                    <MiniStat label="Per working day" value={money(goalPlan.perDayProduction)} />
                  </>
                ) : (
                  <>
                    <MiniStat label="Services to go" value={num(goalPlan.projectedServices)} />
                    <MiniStat label="Services / day" value={num(goalPlan.projectedServices / Math.max(1, goalPlan.remainingDays))} />
                  </>
                )}
                <MiniStat label="Haircuts / day" value={num(goalPlan.projectedHaircuts / Math.max(1, goalPlan.remainingDays))} icon={<Scissors size={13} />} />
                <MiniStat label="Colors / day" value={num(goalPlan.projectedColors / Math.max(1, goalPlan.remainingDays))} icon={<Palette size={13} />} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-[var(--color-ink-faint)]">
                  <span>{showMoney ? `Progress to goal pay ${money(goalPlan.targetPay)}` : `Progress to ${rate(goalRate)}/hr goal`}</span>
                  <span>{Math.round((summary.productionToDate / Math.max(1, goalPlan.requiredProduction)) * 100)}%</span>
                </div>
                <Progress value={summary.productionToDate / Math.max(1, goalPlan.requiredProduction)} />
              </div>
            </>
          )}

          <Link href="/planner" className="mt-4 block">
            <Button variant="soft" className="w-full sm:w-auto">
              <Sliders size={16} /> Open What-If planner <ArrowRight size={16} />
            </Button>
          </Link>
        </CardBody>
      </Card>

      <DailyBreakdown days={periodDays} salonId={stylist.salonId} config={config} showMoney={showMoney} />
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

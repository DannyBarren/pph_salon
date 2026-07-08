"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Scissors, Palette, Clock, Target, Wand2, AlertTriangle, Gauge, CalendarOff, Flag, Check, History } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { salonById, userById } from "@/lib/mockData";
import { sliceDays } from "@/lib/selection";
import { CURRENT_WEEK, fmtRange } from "@/lib/time";
import type { Goal } from "@/lib/types";
import { guaranteeRateFor } from "@/lib/payEngine";
import { servicePricesFor, canSeeMoney } from "@/lib/privacy";
import {
  getRequiredProduction,
  snapServiceMix,
  adjustLinkedSlider,
  productionOf,
  servicesPerHour,
  effectiveRate as calcEffectiveRate,
  assessFeasibility,
  COMMISSION_RATE,
  type ServiceMix,
} from "@/lib/planner";
import { Card, CardBody, Badge, Slider, Button, NumberField } from "@/components/ui/primitives";
import { money, num, rate } from "@/lib/format";
import { cn } from "@/lib/cn";

const MIN_PAY_RATE = 11;
const MAX_PAY_RATE = 29;
const MAX_HOURS = 60;

/**
 * Goal Planner (evolved from the What-If planner). Role-aware: stylists never
 * see revenue or production dollars — they plan with hours, pay rates, service
 * counts and services/hour; managers/owners see the full $ breakdown.
 *
 * On top of the live planner it lets a stylist **Set a Goal for the pay period**
 * — persisting the current plan as an active goal, notifying their manager, and
 * recording override history. The pay-calculation logic is unchanged.
 */
export function GoalPlanner({ stylistId }: { stylistId: string }) {
  const { config, currentUser, getWeeklyData, resolveUser, getDays, setGoal, getActiveGoal, getGoalHistory } = useApp();
  const stylist = resolveUser(stylistId) ?? userById(stylistId)!;
  const salon = salonById(stylist.salonId);
  const prices = servicePricesFor(salon, config.salonServicePrices[stylist.salonId]);
  const showMoney = canSeeMoney(currentUser.role);

  // Guarantee: per-stylist override → salon/global config.
  const guarantee = stylist.guaranteeRate ?? guaranteeRateFor(stylist.salonId, config);

  // Default planned hours: this week's entered data → scheduled day records → 40.
  const defaultHours = useMemo(() => {
    const wd = getWeeklyData(stylistId, CURRENT_WEEK.start);
    if (wd) return wd.scheduledHrs;
    const days = sliceDays(getDays(stylistId), CURRENT_WEEK.start, CURRENT_WEEK.end);
    const scheduled = days.reduce((a, d) => a + d.scheduledHours, 0);
    return scheduled > 0 ? scheduled : 40;
  }, [getWeeklyData, getDays, stylistId]);

  const defaultRate = Math.min(MAX_PAY_RATE, Math.max(MIN_PAY_RATE, Math.round(guarantee + 4)));

  const [payRate, setPayRate] = useState(defaultRate);
  const [hours, setHours] = useState(defaultHours);
  const [mix, setMix] = useState<ServiceMix>({ haircuts: 0, colors: 0 });
  // NEW (V1.1): when true, the next auto-snap is skipped so a prefilled goal
  // mix isn't overwritten by the linked-slider snapping.
  const skipNextSnap = useRef(false);

  // Prefill when the stylist changes. NEW (V1.1): if they already have an active
  // goal for this pay period, load its exact content (pay rate ← PPH, hours, and
  // the saved haircut/color mix) so "Update Goal" opens with their current goal
  // ready to edit. Otherwise fall back to the schedule-based defaults.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const g = getActiveGoal(stylistId, CURRENT_WEEK.start);
    if (g) {
      // PPH = rate / 0.4  ⇒  rate = PPH × 0.4.
      setPayRate(Math.min(MAX_PAY_RATE, Math.max(MIN_PAY_RATE, Math.round(g.targetPph * COMMISSION_RATE))));
      setHours(g.targetHours);
      setMix({ haircuts: g.targetHaircuts, colors: g.targetColors });
      skipNextSnap.current = true; // keep the goal's exact mix, don't re-snap
    } else {
      setPayRate(defaultRate);
      setHours(defaultHours);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stylistId]);

  // Target production is independent of the service sliders (pay + hours only).
  // Kept as a plain (cheap) derivation so the auto-snap effect can key off it.
  const targetProduction = getRequiredProduction(hours, payRate, guarantee, COMMISSION_RATE);

  // Recalc + auto-snap the service mix whenever the target changes (i.e. when
  // the user moves the pay-rate or hours controls). Manual slider drags update
  // `mix` directly and don't touch the target, so they won't be overwritten.
  useEffect(() => {
    if (skipNextSnap.current) {
      skipNextSnap.current = false; // preserve a freshly prefilled goal mix
      return;
    }
    setMix(snapServiceMix(targetProduction, prices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProduction]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const planProduction = productionOf(mix, prices);
  const planRate = calcEffectiveRate(mix, hours, guarantee, COMMISSION_RATE, prices);
  const sph = servicesPerHour(mix, hours);
  const feas = assessFeasibility(mix, hours);
  const isCallOff = hours <= 0;
  const atGuarantee = payRate <= guarantee;

  // Slider ranges scale with a plausible ceiling so the thumb stays useful.
  const maxHaircuts = Math.max(20, Math.ceil((targetProduction || planProduction) / prices.haircut) + 5);
  const maxColors = Math.max(15, Math.ceil((targetProduction || planProduction) / prices.color) + 5);

  // Over/short vs the target production, expressed in $ (managers) or services.
  const overUnits = mix.haircuts + mix.colors - snapCount(targetProduction, prices);
  const productionDelta = planProduction - targetProduction;

  // ── Goal setting ─────────────────────────────────────────────────────────
  // target PPH derived from the desired pay rate: PPH = rate / 0.4.
  const targetPph = Math.round(payRate / COMMISSION_RATE);
  // Only the stylist themselves (or an admin/owner) can set the goal here.
  const canSetGoal = currentUser.id === stylistId || currentUser.role === "sdl";
  const activeGoal = getActiveGoal(stylistId, CURRENT_WEEK.start);
  const history = getGoalHistory(stylistId, CURRENT_WEEK.start);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-transparent bg-gradient-to-br from-[#1d1340] via-[var(--color-brand)] to-[#8b5bff] text-white">
        <div className="flex flex-col gap-1 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-white/85">
            <Sparkles size={16} /> Goal Planner
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Plan {stylist.name.split(" ")[0]}&apos;s pay period</h1>
          <p className="text-sm text-white/80">
            {salon.name} · {fmtRange(CURRENT_WEEK.start, CURRENT_WEEK.end)} · set a goal when you&apos;re ready.
            {!showMoney && " Your revenue totals stay private."}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* ── Controls ─────────────────────────────────────────── */}
        <Card>
          <CardBody className="space-y-6">
            {/* Desired pay rate */}
            <div>
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Target size={16} className="text-[var(--color-brand)]" /> Desired effective pay rate
                  </div>
                  <div className="text-xs text-[var(--color-ink-faint)]">Independent of the service mix below</div>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-[var(--color-brand)] tabular-nums">${payRate}</span>
                  <span className="text-sm text-[var(--color-ink-faint)]">/hr</span>
                </div>
              </div>
              <Slider value={payRate} min={MIN_PAY_RATE} max={MAX_PAY_RATE} step={1} onChange={setPayRate} />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--color-ink-faint)]">
                <span>${MIN_PAY_RATE}</span>
                <span>Guarantee ${num(guarantee)}</span>
                <span>${MAX_PAY_RATE}</span>
              </div>
              {atGuarantee && (
                <p className="mt-2 rounded-xl bg-[var(--color-success-soft)] px-3 py-2 text-xs text-[var(--color-success)]">
                  At or below your ${num(guarantee)}/hr guarantee — this rate is locked in no matter what.
                </p>
              )}
            </div>

            {/* Adjusted hours */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Clock size={16} className="text-[var(--color-brand)]" /> Planned hours this week
                </div>
                <span className="text-lg font-bold tabular-nums">{num(hours)}h</span>
              </div>
              <Slider value={hours} min={0} max={MAX_HOURS} step={1} onChange={(v) => setHours(Math.max(0, v))} />
              <div className="mt-2">
                <NumberField
                  label=""
                  value={hours}
                  min={0}
                  step={1}
                  suffix="hrs"
                  onChange={(v) => setHours(Math.max(0, v))}
                />
              </div>
              <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
                <CalendarOff size={14} className="mt-0.5 shrink-0 text-[var(--color-brand)]" />
                Adjust for planned time off or extra coverage. <b>Set to 0 for a full-week call-off / sick time.</b>{" "}
                Increase to cover someone else&apos;s full schedule.
              </p>
            </div>

            {/* Service mix — two linked sliders */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Wand2 size={16} className="text-[var(--color-brand)]" /> Service mix
                </div>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => setMix(snapServiceMix(targetProduction, prices))}
                  disabled={isCallOff || targetProduction <= 0}
                >
                  <Wand2 size={14} /> Auto-snap to best mix
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Scissors size={14} className="text-[var(--color-brand)]" /> Total haircuts
                    </span>
                    <span className="text-lg font-bold tabular-nums">{mix.haircuts}</span>
                  </div>
                  <Slider
                    value={mix.haircuts}
                    min={0}
                    max={maxHaircuts}
                    step={1}
                    onChange={(v) => setMix(adjustLinkedSlider("haircuts", v, targetProduction, prices))}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Palette size={14} className="text-[var(--color-brand)]" /> Total colors
                    </span>
                    <span className="text-lg font-bold tabular-nums">{mix.colors}</span>
                  </div>
                  <Slider
                    value={mix.colors}
                    min={0}
                    max={maxColors}
                    step={1}
                    onChange={(v) => setMix(adjustLinkedSlider("colors", v, targetProduction, prices))}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
                Dragging one slider auto-adjusts the other to keep the plan on target. The pay-rate slider stays put.
              </p>
            </div>
          </CardBody>
        </Card>

        {/* ── Results ──────────────────────────────────────────── */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {isCallOff ? "Full-week call-off" : `To hit $${payRate}/hr you need…`}
              </h2>
              <Badge tone={isCallOff ? "warning" : atGuarantee ? "success" : feas.unrealistic ? "danger" : "brand"}>
                {isCallOff ? "0 hours" : atGuarantee ? "Guaranteed" : feas.unrealistic ? "Ambitious" : "Plan"}
              </Badge>
            </div>

            {isCallOff ? (
              <div className="rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm text-[var(--color-warning)]">
                <div className="flex items-center gap-2 font-semibold">
                  <CalendarOff size={16} /> No hours planned
                </div>
                <p className="mt-1 text-[var(--color-ink-soft)]">
                  A full-week call-off means no scheduled services and no pay for the week. Add hours above to plan
                  coverage.
                </p>
              </div>
            ) : (
              <>
                {/* Headline targets — service counts are always shown */}
                <div className="grid grid-cols-2 gap-3">
                  <Result icon={<Scissors size={14} />} label="Haircuts" value={num(mix.haircuts)} sub={showMoney ? money(mix.haircuts * prices.haircut) : "for the week"} />
                  <Result icon={<Palette size={14} />} label="Colors" value={num(mix.colors)} sub={showMoney ? money(mix.colors * prices.color) : "for the week"} />
                  <Result icon={<Gauge size={14} />} label="Services / hour" value={sph.toFixed(1)} sub={`${num(mix.haircuts + mix.colors)} services`} />
                  <Result icon={<Target size={14} />} label="This plan pays" value={`${rate(planRate)}/hr`} sub={planRate >= payRate ? "on target" : "under target"} />
                </div>

                {/* Money row — managers/owners only */}
                {showMoney && (
                  <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-ink-soft)]">Target production</span>
                      <span className="font-bold tabular-nums">{money(targetProduction)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-[var(--color-ink-soft)]">This plan produces</span>
                      <span className="font-bold tabular-nums">{money(planProduction)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-[var(--color-ink-soft)]">Over / short</span>
                      <span className={cn("font-bold tabular-nums", productionDelta >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")}>
                        {productionDelta >= 0 ? "+" : "−"}
                        {money(Math.abs(productionDelta))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Over/short in service terms — visible to everyone (incl. stylists) */}
                {!atGuarantee && (
                  <div className="rounded-2xl border border-[var(--color-border)] p-3 text-sm">
                    <span className="text-[var(--color-ink-soft)]">Vs. target: </span>
                    {overUnits === 0 ? (
                      <span className="font-semibold text-[var(--color-success)]">exactly on target 🎯</span>
                    ) : overUnits > 0 ? (
                      <span className="font-semibold text-[var(--color-success)]">+{num(overUnits)} services over</span>
                    ) : (
                      <span className="font-semibold text-[var(--color-warning)]">{num(-overUnits)} services short</span>
                    )}
                  </div>
                )}

                {/* Realism warning */}
                {feas.warning && (
                  <div className="flex items-start gap-2 rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm text-[var(--color-warning)]">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    {feas.warning}
                  </div>
                )}

                <div className="rounded-2xl border border-[var(--color-brand-soft)] bg-[var(--color-brand-soft)] p-3 text-sm text-[var(--color-brand-ink)]">
                  <b>Flash goal:</b>{" "}
                  {atGuarantee
                    ? "You're at your guarantee — set the bar higher to plan a stretch week!"
                    : `Book about ${num(Math.ceil(sph))} services/hour across ${num(hours)} hours to reach $${payRate}/hr.`}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Set Goal for this Pay Period ─────────────────────────── */}
      <GoalSection
        stylistName={stylist.name}
        canSetGoal={canSetGoal}
        isCallOff={isCallOff}
        activeGoal={activeGoal}
        history={history}
        currentPlan={{ targetPph, targetHours: hours, targetHaircuts: mix.haircuts, targetColors: mix.colors }}
        onSetGoal={() =>
          setGoal(stylistId, CURRENT_WEEK.start, {
            targetPph,
            targetHours: hours,
            targetHaircuts: mix.haircuts,
            targetColors: mix.colors,
          })
        }
      />
    </div>
  );
}

/* ── Goal section: set button, active goal + status, and history ── */

const STATUS_META: Record<Goal["approvalStatus"], { label: string; tone: "neutral" | "success" | "danger" }> = {
  pending: { label: "Pending review", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  disapproved: { label: "Needs changes", tone: "danger" },
};

function GoalSection({
  stylistName,
  canSetGoal,
  isCallOff,
  activeGoal,
  history,
  currentPlan,
  onSetGoal,
}: {
  stylistName: string;
  canSetGoal: boolean;
  isCallOff: boolean;
  activeGoal?: Goal;
  history: Goal[];
  currentPlan: { targetPph: number; targetHours: number; targetHaircuts: number; targetColors: number };
  onSetGoal: () => void;
}) {
  const [justSaved, setJustSaved] = useState(false);
  const priorGoals = history.filter((g) => !g.isActive);

  const handleSet = () => {
    onSetGoal();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  return (
    <Card className="border-[var(--color-brand)]/30">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Flag size={18} className="text-[var(--color-brand)]" /> Goal for this Pay Period
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-ink-faint)]">
              {activeGoal
                ? "Your current goal is saved. Override it any time — your manager will be notified."
                : "Lock in your plan as a goal. Your manager will be notified to review it."}
            </p>
          </div>
          {canSetGoal && (
            <Button onClick={handleSet} disabled={isCallOff}>
              {justSaved ? <Check size={16} /> : <Flag size={16} />}
              {justSaved ? "Goal saved" : activeGoal ? "Update Goal" : "Set Goal for this Pay Period"}
            </Button>
          )}
        </div>

        {/* What "Set / Update Goal" will save (from the planner above). */}
        {canSetGoal && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">
              {activeGoal ? "From the planner — click Update to save" : "This will be saved"}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <GoalStat label="Target PPH" value={`${currentPlan.targetPph}`} />
              <GoalStat label="Hours" value={`${num(currentPlan.targetHours)}h`} />
              <GoalStat label="Haircuts" value={`${currentPlan.targetHaircuts}`} />
              <GoalStat label="Colors" value={`${currentPlan.targetColors}`} />
            </div>
            {/* NEW (V1.1): make the replace-and-archive behavior explicit. */}
            {activeGoal && (
              <p className="mt-2 rounded-xl bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning)]">
                Updating replaces your current goal for this pay period. The previous goal moves to History.
              </p>
            )}
          </div>
        )}

        {/* Active goal + review status. */}
        {activeGoal && (
          <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Active goal</span>
              <Badge tone={STATUS_META[activeGoal.approvalStatus].tone}>
                {STATUS_META[activeGoal.approvalStatus].label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <GoalStat label="Target PPH" value={`${activeGoal.targetPph}`} />
              <GoalStat label="Hours" value={`${num(activeGoal.targetHours)}h`} />
              <GoalStat label="Haircuts" value={`${activeGoal.targetHaircuts}`} />
              <GoalStat label="Colors" value={`${activeGoal.targetColors}`} />
            </div>
            {activeGoal.managerComment && (
              <p className="mt-2 rounded-xl bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                <b>Manager:</b> {activeGoal.managerComment}
              </p>
            )}
          </div>
        )}

        {/* Goal history (visible to stylist + manager). */}
        {priorGoals.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-soft)]">
              <History size={15} /> Goal history ({priorGoals.length} previous)
            </div>
            <ul className="space-y-1.5">
              {priorGoals.map((g) => (
                <li key={g.id} className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[var(--color-ink-soft)]">
                      PPH {g.targetPph} · {num(g.targetHours)}h · {g.targetHaircuts} cuts · {g.targetColors} colors
                    </span>
                    {/* NEW (V1.1): show each superseded goal's final status + set time. */}
                    <span className="flex items-center gap-2">
                      <Badge tone={STATUS_META[g.approvalStatus].tone}>{STATUS_META[g.approvalStatus].label}</Badge>
                      <span className="text-[11px] text-[var(--color-ink-faint)]">
                        {new Date(g.setAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </span>
                  </div>
                  {/* NEW (V1.1): manager comment on the archived goal, if any. */}
                  {g.managerComment && (
                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                      <b>Manager:</b> {g.managerComment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!canSetGoal && !activeGoal && (
          <p className="text-sm text-[var(--color-ink-faint)]">{stylistName} hasn&apos;t set a goal for this period yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

function GoalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-2 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

/** Count of services in the snapped mix for the target, used for over/short. */
function snapCount(targetProduction: number, prices: { haircut: number; color: number }): number {
  const snapped = snapServiceMix(targetProduction, prices);
  return snapped.haircuts + snapped.colors;
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

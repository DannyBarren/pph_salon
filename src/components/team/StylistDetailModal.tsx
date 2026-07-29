"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Scissors, Palette, Users, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Modal, Segmented, Button, Avatar, ProgressRing } from "@/components/ui/primitives";
import { money, num, pct, rate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { StylistPerformance } from "@/lib/teamTypes";
import {
  getRequiredProductionForPayRate,
  getNextTier,
  pphForRate,
  productionToServices,
} from "@/lib/tiers";
import { getActiveTiers } from "@/lib/paymentLogic";
import { actionMessage, statusHeadline, rateTone } from "@/lib/teamMessaging";
import { StatusBadge } from "./StatusBadge";

type Tab = "summary" | "byday" | "whatif";

const RATE_TEXT: Record<"success" | "warning" | "danger", string> = {
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
};

/**
 * Manager detail modal — gives the same rich Week Summary / Week-by-Day
 * experience a stylist sees, plus manager-only extras: comparison to the team
 * average, a coaching note, and an inline What-If pre-filled for this stylist.
 *
 * TODO: Review with Danny — this modal is self-contained (the team roster is
 * separate from the demo AppContext users). If we later add these stylists to
 * the shared store, "Open full Week Summary" can deep-link to `/` instead.
 */
export function StylistDetailModal({
  perf,
  teamAvgRate,
  open,
  onClose,
  initialTab = "summary",
}: {
  perf: StylistPerformance | null;
  teamAvgRate: number;
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Sync the active tab whenever the modal opens for a (possibly new) stylist.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, perf?.id, initialTab]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!perf) return null;

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <Header perf={perf} />

      <div className="mt-4">
        <Segmented
          options={[
            { value: "summary", label: "Week Summary" },
            { value: "byday", label: "Week by Day" },
            { value: "whatif", label: "What If" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>

      <div className="mt-4">
        {tab === "summary" && <SummaryTab perf={perf} teamAvgRate={teamAvgRate} />}
        {tab === "byday" && <ByDayTab perf={perf} />}
        {tab === "whatif" && <WhatIfTab perf={perf} />}
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {tab !== "whatif" && (
          <Button variant="primary" onClick={() => setTab("whatif")}>
            Plan with What-If
          </Button>
        )}
      </div>
    </Modal>
  );
}

function Header({ perf }: { perf: StylistPerformance }) {
  const tone = rateTone(perf.effectiveRate, perf.targetPayRate);
  return (
    <div className="flex items-start gap-3">
      <Avatar initials={perf.initials} hue={perf.hue} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{perf.name}</h2>
          <span className="text-xs text-[var(--color-ink-faint)] tabular-nums">#{perf.stylistId}</span>
          <StatusBadge status={perf.status} />
        </div>
        <div className="text-sm text-[var(--color-ink-faint)]">
          {perf.title} · {perf.weekLabel}
        </div>
        <div className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{statusHeadline(perf)}</div>
      </div>
      <div className="hidden text-right sm:block">
        <div className={cn("text-2xl font-bold tabular-nums", RATE_TEXT[tone])}>
          {perf.actualHours > 0 ? rate(perf.effectiveRate) : "—"}
        </div>
        <div className="text-[11px] text-[var(--color-ink-faint)]">Target ${perf.targetPayRate}/hr</div>
      </div>
    </div>
  );
}

function SummaryTab({ perf, teamAvgRate }: { perf: StylistPerformance; teamAvgRate: number }) {
  const [note, setNote] = useState("");
  const delta = perf.effectiveRate - teamAvgRate;
  const overShort = perf.productionDelta;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Scheduled" value={`${num(perf.scheduledHours)}h`} />
        <Metric label="Actual" value={`${num(perf.actualHours)}h`} />
        <Metric
          label="Utilization"
          value={perf.actualHours > 0 ? pct(perf.utilization) : "—"}
          tone={perf.utilization >= 0.85 ? "success" : perf.utilization >= 0.7 ? "warning" : "danger"}
        />
        <Metric label="PPH" value={num(perf.pph)} />
        <Metric label="Production" value={money(perf.production)} />
        <Metric label="Pay (est.)" value={money(perf.pay)} />
        <Metric
          label="Over / Short"
          value={`${overShort >= 0 ? "+" : "−"}${money(Math.abs(overShort))}`}
          tone={overShort >= 0 ? "success" : "danger"}
        />
        <Metric
          label="Effective"
          value={perf.actualHours > 0 ? rate(perf.effectiveRate) : "—"}
          tone={rateTone(perf.effectiveRate, perf.targetPayRate)}
        />
      </div>

      <div className="rounded-2xl bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-ink-soft)]">
        {actionMessage(perf)}
      </div>

      {/* Manager-only extras */}
      <div className="rounded-2xl border border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users size={15} aria-hidden="true" /> Vs. team average
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {perf.actualHours === 0 ? (
            <span className="text-[var(--color-ink-faint)]">No hours worked yet</span>
          ) : (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold",
                  delta >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]",
                )}
              >
                {delta > 0.05 ? <TrendingUp size={15} /> : delta < -0.05 ? <TrendingDown size={15} /> : <Minus size={15} />}
                {delta >= 0 ? "+" : "−"}
                {rate(Math.abs(delta))}/hr
              </span>
              <span className="text-[var(--color-ink-faint)]">
                {delta >= 0 ? "above" : "below"} team avg of {rate(teamAvgRate)}/hr
              </span>
            </>
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--color-ink-soft)]">Coaching note (private)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(sanitizeNote(e.target.value))}
          rows={2}
          placeholder="e.g. Great color week — nudge on rebooking to lift PPH."
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
        />
        <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">
          Notes are local to this session in the demo. Backend must sanitize + persist per-manager.
        </span>
      </label>
    </div>
  );
}

function ByDayTab({ perf }: { perf: StylistPerformance }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">{perf.name} week-by-day breakdown</caption>
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
            <th scope="col" className="px-3 py-2 text-left">Day</th>
            <th scope="col" className="px-3 py-2 text-right">Hrs</th>
            <th scope="col" className="px-3 py-2 text-right">Cuts</th>
            <th scope="col" className="px-3 py-2 text-right">Colors</th>
            <th scope="col" className="px-3 py-2 text-right">Production</th>
            <th scope="col" className="px-3 py-2 text-right">Target</th>
          </tr>
        </thead>
        <tbody>
          {perf.daily.map((d) => {
            const met = d.production >= d.requiredProduction;
            return (
              <tr key={d.date} className={cn("border-b border-[var(--color-border)] last:border-0", d.upcoming && "opacity-60")}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {d.label}
                  {d.upcoming && <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">(upcoming)</span>}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {d.upcoming ? num(d.scheduledHours) : `${num(d.actualHours)}/${num(d.scheduledHours)}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Scissors size={11} aria-hidden="true" /> {d.upcoming ? "—" : num(d.haircuts)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Palette size={11} aria-hidden="true" /> {d.upcoming ? "—" : num(d.colors)}
                  </span>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-semibold tabular-nums",
                    !d.upcoming && (met ? "text-[var(--color-success)]" : "text-[var(--color-ink)]"),
                  )}
                >
                  {d.upcoming ? "—" : money(d.production)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-faint)]">
                  {money(d.requiredProduction)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WhatIfTab({ perf }: { perf: StylistPerformance }) {
  const guarantee = perf.guaranteeRate;
  const activeTiers = getActiveTiers();
  const maxRate = activeTiers[activeTiers.length - 1].payRate;
  const defaultTarget = getNextTier(perf.effectiveRate)?.payRate ?? perf.targetPayRate;
  const [target, setTarget] = useState<number>(Math.max(guarantee, Math.min(maxRate, defaultTarget)));

  const plan = useMemo(() => {
    const requiredTotal = getRequiredProductionForPayRate(perf.scheduledHours, target);
    const remaining = Math.max(0, requiredTotal - perf.production);
    const perDay = perf.remainingScheduledHours > 0 ? remaining / perf.remainingScheduledHours : 0;
    const services = productionToServices(remaining).blended;
    return { requiredTotal, remaining, perDay, services, pph: pphForRate(target) };
  }, [perf, target]);

  const progress = plan.requiredTotal > 0 ? Math.min(1, perf.production / plan.requiredTotal) : 1;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div className="text-sm font-semibold">Target effective rate</div>
          <div>
            <span className="text-2xl font-bold text-[var(--color-brand)] tabular-nums">${target}</span>
            <span className="text-sm text-[var(--color-ink-faint)]">/hr</span>
          </div>
        </div>
        <input
          type="range"
          min={guarantee}
          max={maxRate}
          step={1}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          aria-label={`Target rate for ${perf.name}`}
        />
        <div className="mt-1 flex justify-between text-[11px] text-[var(--color-ink-faint)]">
          <span>Guarantee ${guarantee}</span>
          <span>Requires {num(plan.pph)} PPH</span>
          <span>${maxRate}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-[var(--color-surface-2)] p-4">
        <ProgressRing value={progress} size={92} stroke={10}>
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">Done</span>
          <span className="text-base font-bold tabular-nums">{Math.round(progress * 100)}%</span>
        </ProgressRing>
        <div className="flex-1">
          <div className="text-xs text-[var(--color-ink-faint)]">Production still needed this week</div>
          <div className="text-2xl font-bold tabular-nums">{money(plan.remaining)}</div>
          <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            of {money(plan.requiredTotal)} · {money(perf.production)} banked
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Per day" value={money(plan.perDay)} sub={`${num(perf.remainingScheduledHours)}h left`} />
        <Metric label="Haircuts" value={num(plan.services.haircuts)} sub="or blended" />
        <Metric label="Colors" value={num(plan.services.colors)} sub="split 50/50" />
      </div>

      <p className="rounded-2xl border border-[var(--color-brand-soft)] bg-[var(--color-brand-soft)] p-3 text-sm text-[var(--color-brand-ink)]">
        {plan.remaining <= 0
          ? `${perf.firstName} has already locked in $${target}/hr — aim higher!`
          : `${perf.firstName} needs about ${money(plan.perDay)}/day (~${num(
              plan.services.haircuts,
            )} cuts + ${num(plan.services.colors)} colors total) to reach $${target}/hr.`}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneText: Record<string, string> = {
    default: "",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
    danger: "text-[var(--color-danger)]",
  };
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</div>
      <div className={cn("mt-0.5 text-base font-bold tabular-nums", toneText[tone])}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--color-ink-faint)]">{sub}</div>}
    </div>
  );
}

/** Strip angle brackets so a note can't inject markup if later rendered as HTML. */
function sanitizeNote(input: string): string {
  return input.replace(/[<>]/g, "").slice(0, 500);
}

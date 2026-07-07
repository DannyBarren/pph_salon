"use client";

import React from "react";
import { Progress } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import type { StylistPerformance } from "@/lib/teamTypes";

/**
 * Visualises progress from a stylist's achieved tier toward the next PayRt tier,
 * with the exact production still required to get there.
 */
export function ProgressToNextTier({ p }: { p: StylistPerformance }) {
  const current = p.effectiveRate;
  const next = p.nextTier;

  if (!next) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--color-ink-soft)]">Top tier reached</span>
          <span className="text-[var(--color-success)]">${current}/hr</span>
        </div>
        <Progress value={1} tone="success" />
      </div>
    );
  }

  const remaining = p.remainingToHold.achieved
    ? p.remainingToTarget.remainingProduction
    : p.remainingToHold.remainingProduction;

  const tone = p.tierProgress >= 0.66 ? "success" : p.tierProgress >= 0.33 ? "warning" : "brand";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--color-ink-soft)]">
          ${Math.round(current)}/hr → ${next.payRate}/hr
        </span>
        <span className="text-[var(--color-ink-faint)] tabular-nums">{Math.round(p.tierProgress * 100)}%</span>
      </div>
      <Progress value={p.tierProgress} tone={tone} />
      <div className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
        {remaining > 0
          ? `${money(remaining)} more production to reach $${next.payRate}/hr`
          : `Holding $${Math.round(current)}/hr`}
      </div>
    </div>
  );
}

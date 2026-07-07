"use client";

import React from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardBody, SectionTitle } from "@/components/ui/primitives";
import type { RateBand } from "@/lib/teamTypes";

/**
 * Team pay-rate distribution insight — how many stylists sit in each effective
 * rate band. Rendered as an accessible list with proportional bars.
 */
export function TeamDistribution({ distribution, total }: { distribution: RateBand[]; total: number }) {
  const max = Math.max(1, ...distribution.map((b) => b.count));

  const summary = distribution
    .filter((b) => b.count > 0)
    .map((b) => `${b.count} at ${b.label}`)
    .join(", ");

  return (
    <Card>
      <CardBody>
        <SectionTitle hint={`${total} stylists`}>
          <span className="inline-flex items-center gap-1.5">
            <BarChart3 size={14} aria-hidden="true" /> Effective rate distribution
          </span>
        </SectionTitle>
        <ul className="space-y-2" aria-label={`Rate distribution: ${summary || "no data"}`}>
          {distribution.map((b) => (
            <li key={b.label} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium text-[var(--color-ink-soft)] tabular-nums">
                {b.label}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)] transition-all"
                  style={{ width: `${(b.count / max) * 100}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums">{b.count}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

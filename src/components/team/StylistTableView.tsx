"use client";

import React from "react";
import { ArrowUpDown, Eye, Sliders } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { money, num, pct, rate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SortKey, StylistPerformance } from "@/lib/teamTypes";
import { rateTone } from "@/lib/teamMessaging";
import { StatusBadge } from "./StatusBadge";

const RATE_TEXT: Record<"success" | "warning" | "danger", string> = {
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
};

interface Col {
  key: string;
  label: string;
  sortKey?: SortKey;
  numeric?: boolean;
}

const COLS: Col[] = [
  { key: "name", label: "Stylist", sortKey: "name" },
  { key: "hours", label: "Hrs (act/sched)", numeric: true, sortKey: "utilization" },
  { key: "util", label: "Util", numeric: true, sortKey: "utilization" },
  { key: "prod", label: "Production", numeric: true, sortKey: "production" },
  { key: "rate", label: "Effective $/hr", numeric: true, sortKey: "effectiveRate" },
  { key: "tier", label: "Tier" },
  { key: "gap", label: "Gap to next", numeric: true, sortKey: "gapToNext" },
  { key: "status", label: "Status" },
  { key: "actions", label: "" },
];

/**
 * Dense, sortable table view (power-user friendly). Sticky header, horizontal
 * scroll on narrow viewports, and `aria-sort` on sortable columns.
 */
export function StylistTableView({
  perfs,
  sort,
  onSortChange,
  onDetails,
  onWhatIf,
}: {
  perfs: StylistPerformance[];
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  onDetails: (p: StylistPerformance) => void;
  onWhatIf: (p: StylistPerformance) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <caption className="sr-only">Team stylist performance for the current week</caption>
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            {COLS.map((c) => {
              const active = c.sortKey && c.sortKey === sort;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? "descending" : "none"}
                  className={cn(
                    "sticky top-0 z-10 whitespace-nowrap bg-[var(--color-surface-2)] px-3 py-2.5 text-[11px] font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase",
                    c.numeric ? "text-right" : "text-left",
                  )}
                >
                  {c.sortKey ? (
                    <button
                      onClick={() => onSortChange(c.sortKey!)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-[var(--color-ink)]",
                        active && "text-[var(--color-brand)]",
                      )}
                    >
                      {c.label}
                      <ArrowUpDown size={12} aria-hidden="true" />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {perfs.map((p) => {
            const tone = rateTone(p.effectiveRate, p.targetPayRate);
            return (
              <tr
                key={p.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
              >
                <th scope="row" className="px-3 py-2.5 text-left font-medium">
                  <button
                    onClick={() => onDetails(p)}
                    className="text-left hover:text-[var(--color-brand)] hover:underline"
                  >
                    {p.name}
                  </button>
                  <div className="text-[11px] font-normal text-[var(--color-ink-faint)]">#{p.stylistId}</div>
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {num(p.actualHours)}/{num(p.scheduledHours)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.actualHours > 0 ? pct(p.utilization) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(p.production)}</td>
                <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", RATE_TEXT[tone])}>
                  {p.actualHours > 0 ? rate(p.effectiveRate) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {p.onGuarantee ? `Gtd $${p.guaranteeRate}` : p.achievedTier ? `PayRt ${p.achievedTier.payRate}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {p.nextTier
                    ? p.remainingToTarget.remainingProduction > 0
                      ? money(p.remainingToTarget.remainingProduction)
                      : "Met"
                    : "Top"}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onDetails(p)} aria-label={`View ${p.name} details`}>
                      <Eye size={15} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onWhatIf(p)} aria-label={`What-if for ${p.name}`}>
                      <Sliders size={15} aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

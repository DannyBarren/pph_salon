"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { SortKey, StatusFilter } from "@/lib/teamTypes";

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "on_track", label: "On Track" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "behind", label: "Behind" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "effectiveRate", label: "Effective Pay ↓" },
  { value: "gapToNext", label: "Gap to Next Level ↑" },
  { value: "utilization", label: "Utilization ↓" },
  { value: "production", label: "Production ↓" },
  { value: "name", label: "Name (A–Z)" },
];

/**
 * Quick-filter row: debounced name/ID search, status chips (with live counts),
 * and a sort dropdown.
 */
export function TeamFiltersBar({
  search,
  onSearch,
  status,
  onStatus,
  sort,
  onSort,
  counts,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  counts: Record<StatusFilter, number>;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {/* Search */}
      <div className="relative w-full lg:max-w-xs">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name or ID…"
          aria-label="Search stylists by name or ID"
          className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-9 text-sm outline-none focus:border-[var(--color-brand)]"
        />
        {search && (
          <button
            onClick={() => onSearch("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {STATUS_CHIPS.map((c) => {
            const active = status === c.value;
            return (
              <button
                key={c.value}
                onClick={() => onStatus(c.value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand-ink)]"
                    : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                {c.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] tabular-nums",
                    active ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-surface-2)]",
                  )}
                >
                  {counts[c.value]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <Select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          aria-label="Sort stylists"
          className="h-10"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

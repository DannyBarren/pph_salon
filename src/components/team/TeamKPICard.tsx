"use client";

import React from "react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export type KpiTone = "default" | "brand" | "success" | "warning" | "danger";

const TONES: Record<KpiTone, string> = {
  default: "",
  brand: "bg-[var(--color-brand-soft)] border-transparent",
  success: "bg-[var(--color-success-soft)] border-transparent",
  warning: "bg-[var(--color-warning-soft)] border-transparent",
  danger: "bg-red-50 border-transparent",
};

/**
 * A single KPI tile for the dashboard header. `value` is announced with its
 * `label` for assistive tech via an accessible group.
 */
export function TeamKPICard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: KpiTone;
}) {
  return (
    <Card className={cn("p-4", TONES[tone])} role="group" aria-label={`${label}: ${valueToText(value)}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">{label}</span>
        {icon && <span className="text-[var(--color-ink-faint)]" aria-hidden="true">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{sub}</div>}
    </Card>
  );
}

function valueToText(value: React.ReactNode): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

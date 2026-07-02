"use client";

import React from "react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "brand" | "success" | "warning";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "",
    brand: "bg-[var(--color-brand-soft)] border-transparent",
    success: "bg-[var(--color-success-soft)] border-transparent",
    warning: "bg-[var(--color-warning-soft)] border-transparent",
  };
  return (
    <Card className={cn("p-4", tones[tone], className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">{label}</span>
        {icon && <span className="text-[var(--color-ink-faint)]">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{sub}</div>}
    </Card>
  );
}

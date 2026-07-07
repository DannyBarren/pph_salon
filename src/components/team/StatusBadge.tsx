"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { PerformanceStatus } from "@/lib/teamTypes";
import { statusMeta } from "@/lib/teamMessaging";

const ICONS: Record<PerformanceStatus, React.ReactNode> = {
  on_track: <CheckCircle2 size={13} aria-hidden="true" />,
  needs_attention: <AlertTriangle size={13} aria-hidden="true" />,
  behind: <TrendingDown size={13} aria-hidden="true" />,
};

/**
 * Status pill combining color + icon + text (never color alone) so it meets
 * WCAG 2.1 AA. Includes an accessible label describing the status.
 */
export function StatusBadge({ status, label }: { status: PerformanceStatus; label?: string }) {
  const meta = statusMeta(status);
  return (
    <Badge tone={meta.tone}>
      <span role="img" aria-label={`Status: ${meta.label}`}>
        {ICONS[status]}
      </span>
      {label ?? meta.label}
    </Badge>
  );
}

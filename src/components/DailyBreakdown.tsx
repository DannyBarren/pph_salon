"use client";

import React from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardBody, SectionTitle } from "@/components/ui/primitives";
import { WEEKDAY_LABELS, isToday, weekdayIndex } from "@/lib/time";
import { usDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DailyRow } from "@/lib/uatDashboard";

/**
 * Daily Breakdown — matches the client's UAT 2 spreadsheet columns exactly:
 * Date | Services ($) (Act vs. Goal) | Haircuts (Act vs. Goal) |
 * Colors (Act vs. Goal) | Hours (Act vs Sched) | PPH (actual vs required).
 *
 * Rows are computed upstream (`uatDashboard.computeWeek`) so this component is
 * pure presentation. Unscheduled days render blank, like the spreadsheet.
 */
export function DailyBreakdown({ rows }: { rows: DailyRow[] }) {
  const trim = (n: number) => `${Math.round(n * 100) / 100}`;

  return (
    <Card>
      <CardBody>
        <SectionTitle hint="Actual vs. goal for each day · updates as new data is imported">
          <span className="inline-flex items-center gap-2 normal-case">
            <CalendarDays size={16} className="text-[var(--color-brand)]" /> Daily Breakdown
          </span>
        </SectionTitle>

        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                <Th>Date</Th>
                <Th>Services ($) (Act vs. Goal)</Th>
                <Th>Haircuts (Act vs. Goal)</Th>
                <Th>Colors (Act vs. Goal)</Th>
                <Th>Hours (Act vs Sched)</Th>
                <Th>PPH</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const today = isToday(r.date);
                const label = `${usDate(r.date).slice(0, 5)} (${WEEKDAY_LABELS[weekdayIndex(r.date)]})`;
                if (!r.scheduled) {
                  return (
                    <tr key={r.date} className="text-[var(--color-ink-faint)]">
                      <Td className={cn(today && "font-semibold text-[var(--color-brand-ink)]")}>{label}</Td>
                      <Td className="text-[var(--color-ink-faint)]">—</Td>
                      <Td>—</Td>
                      <Td>—</Td>
                      <Td>—</Td>
                      <Td>—</Td>
                    </tr>
                  );
                }
                const metRev = r.actualRev >= r.goalRev;
                const metPph = r.actualPph >= r.reqPph;
                return (
                  <tr
                    key={r.date}
                    className={cn("align-top", today && "bg-[var(--color-brand-soft)]")}
                  >
                    <Td className={cn("font-medium", today && "text-[var(--color-brand-ink)]")}>{label}</Td>
                    <Td>
                      <span className={cn("font-semibold tabular-nums", metRev ? "text-[var(--color-success)]" : "text-[var(--color-ink)]")}>
                        {trim(r.actualRev)}
                      </span>
                      <span className="text-[var(--color-ink-faint)]"> vs. reqd {Math.round(r.goalRev)}</span>
                    </Td>
                    <Td>
                      <span className="tabular-nums">{r.actualHaircuts}</span>
                      <span className="text-[var(--color-ink-faint)]"> out of {r.reqHaircuts}</span>
                    </Td>
                    <Td>
                      <span className="tabular-nums">{r.actualColors}</span>
                      <span className="text-[var(--color-ink-faint)]"> out of {r.reqColors}</span>
                    </Td>
                    <Td>
                      <span className="tabular-nums">{trim(r.actualHrs)} hrs.</span>
                      <span className="text-[var(--color-ink-faint)]"> out of {trim(r.schedHrs)} hrs.</span>
                    </Td>
                    <Td>
                      <span className={cn("font-semibold tabular-nums", metPph ? "text-[var(--color-success)]" : "text-[var(--color-ink)]")}>
                        ${r.actualPph}
                      </span>
                      <span className="text-[var(--color-ink-faint)]"> vs ${r.reqPph}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-[var(--color-border)] px-3 py-2 whitespace-nowrap">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-[var(--color-border)] px-3 py-2.5 whitespace-nowrap", className)}>{children}</td>
  );
}

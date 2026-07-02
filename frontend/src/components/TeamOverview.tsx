"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Activity, DollarSign, ShieldCheck, TrendingUp, Flame, Sliders, CalendarCheck, ChevronRight } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { USAGE, salonById } from "@/lib/mockData";
import { resolveSelection, sliceDays } from "@/lib/selection";
import { guaranteeRateFor, summarize } from "@/lib/payEngine";
import { Card, CardBody, Avatar, Badge, Progress, SectionTitle } from "@/components/ui/primitives";
import { Stat } from "@/components/Stat";
import { money, num, rate, pct } from "@/lib/format";
import type { User } from "@/lib/types";

export function TeamOverview() {
  const { allowedStylists, config, timeView, selectedWeekId, selectedPeriodIndex, getDays, setViewedStylistId, currentUser } = useApp();
  const router = useRouter();

  const view = timeView === "planner" ? "current-prior" : timeView;
  const sel = resolveSelection(view, selectedWeekId, selectedPeriodIndex);

  const rows = useMemo(
    () =>
      allowedStylists.map((s) => {
        const days = sliceDays(getDays(s.id), sel.start, sel.end);
        const summary = summarize(days, s.salonId, config);
        const guarantee = guaranteeRateFor(s.salonId, config);
        return { stylist: s, summary, guarantee, usage: USAGE[s.id] };
      }),
    [allowedStylists, getDays, sel.start, sel.end, config],
  );

  const team = useMemo(() => {
    const n = rows.length || 1;
    const avgRate = rows.reduce((a, r) => a + r.summary.effectiveRate, 0) / n;
    const totalProd = rows.reduce((a, r) => a + r.summary.productionToDate, 0);
    const onGuarantee = rows.filter((r) => r.summary.onGuarantee).length;
    const adoption = rows.reduce((a, r) => a + r.usage.daysOpenedLast14, 0) / n / 14;
    const plannerUsers = rows.filter((r) => r.usage.plannerUsesLast14 > 0).length;
    return { avgRate, totalProd, onGuarantee, adoption, plannerUsers };
  }, [rows]);

  // Group by salon for SDL.
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.stylist.salonId;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  const goView = (s: User) => {
    setViewedStylistId(s.id);
    router.push("/");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Team avg rate" value={`${rate(team.avgRate)}/hr`} sub={`${rows.length} stylists`} icon={<DollarSign size={16} />} tone="brand" />
        <Stat label="Total production" value={money(team.totalProd)} sub={sel.sublabel} icon={<TrendingUp size={16} />} />
        <Stat label="On guarantee" value={num(team.onGuarantee)} sub={`${rows.length - team.onGuarantee} on commission`} icon={<ShieldCheck size={16} />} tone={team.onGuarantee > rows.length / 2 ? "warning" : "default"} />
        <Stat label="Adoption" value={pct(team.adoption)} sub={`${team.plannerUsers} used planner`} icon={<Activity size={16} />} tone="success" />
      </div>

      {groups.map(([salonId, grp]) => (
        <Card key={salonId}>
          <CardBody>
            <SectionTitle hint={`${grp.length} stylists`}>
              {currentUser.role === "sdl" ? `${salonById(salonId).name} · ${salonById(salonId).city}` : "Your direct reports"}
            </SectionTitle>
            <div className="space-y-2">
              {grp.map(({ stylist, summary, guarantee, usage }) => {
                const goal = guarantee + 12;
                const prog = Math.min(1, summary.effectiveRate / goal);
                return (
                  <button
                    key={stylist.id}
                    onClick={() => goView(stylist)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] p-3 text-left transition hover:bg-[var(--color-surface-2)]"
                  >
                    <Avatar initials={stylist.initials} hue={stylist.hue} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{stylist.name}</span>
                        <span className="hidden text-xs text-[var(--color-ink-faint)] sm:inline">{stylist.title}</span>
                        {summary.onGuarantee ? <Badge tone="warning">Guarantee</Badge> : <Badge tone="success">Commission</Badge>}
                      </div>
                      <div className="mt-1.5 max-w-xs">
                        <Progress value={prog} tone={summary.onGuarantee ? "warning" : "success"} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-ink-faint)]">
                        <span className="inline-flex items-center gap-1"><CalendarCheck size={11} /> {usage.daysOpenedLast14}/14 days</span>
                        <span className="inline-flex items-center gap-1"><Sliders size={11} /> {usage.plannerUsesLast14} plans</span>
                        <span className="inline-flex items-center gap-1"><Flame size={11} /> {usage.streak}d streak</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold tabular-nums">{rate(summary.effectiveRate)}</div>
                      <div className="text-[11px] text-[var(--color-ink-faint)]">{money(summary.productionToDate)}</div>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-[var(--color-ink-faint)]" />
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

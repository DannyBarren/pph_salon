"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  DollarSign,
  TrendingUp,
  Gauge,
  CalendarClock,
  Activity,
  RefreshCw,
  Download,
  AlertTriangle,
  Minus,
  Plus,
  Inbox,
} from "lucide-react";
import { useApp } from "@/store/AppContext";
import { isAtLeast } from "@/lib/roles";
import { Button, Segmented, Card, CardBody } from "@/components/ui/primitives";
import { money, num, pct, rate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useTeamDashboard, filterAndSortPerformances } from "@/hooks/useTeamDashboard";
import { useDebounced } from "@/hooks/useDebounced";
import { TEAM_WEEK } from "@/lib/teamData";
import { DEMO_MODE } from "@/lib/featureFlags";
import { getActiveTiers } from "@/lib/paymentLogic";
import { performancesToCsv, downloadFile } from "@/lib/exportCsv";
import { track } from "@/lib/telemetry";
import { rateTone } from "@/lib/teamMessaging";
import type { PerfView, SortKey, StatusFilter, StylistPerformance, TeamFilters } from "@/lib/teamTypes";
import { TeamKPICard } from "./TeamKPICard";
import { TeamFiltersBar } from "./TeamFiltersBar";
import { TeamDistribution } from "./TeamDistribution";
import { StylistCard } from "./StylistCard";
import { StylistTableView } from "./StylistTableView";
import { StylistDetailModal } from "./StylistDetailModal";
import { CardsGridSkeleton, KpiSkeleton } from "./Skeletons";
import { SectionErrorBoundary } from "./ErrorBoundary";

type Layout = "cards" | "table";

const TARGET_KEY = "pph-team-target-v1";
const DEFAULT_TARGET = 19;
const VIRTUALIZE_THRESHOLD = 25;

const RATE_TEXT: Record<"success" | "warning" | "danger", string> = {
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
};

/**
 * Production-grade Team Dashboard for managers / SDLs. Role-gated at the page
 * level; this component assumes an authorised viewer and additionally scopes
 * data by salon.
 */
export function TeamDashboard() {
  const { currentUser } = useApp();

  // SDL/Owner and Admin see every salon; managers see only their own.
  const seesAllSalons = isAtLeast(currentUser.role, "sdl");
  const salonIds = useMemo(
    () => (seesAllSalons ? [] : [currentUser.salonId]),
    [seesAllSalons, currentUser.salonId],
  );

  // ── Controls ───────────────────────────────────────────────────────────
  const [targetPayRate, setTargetPayRate] = useState(DEFAULT_TARGET);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [layout, setLayout] = useState<Layout>("cards");
  const [view, setView] = useState<PerfView>("actual");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("effectiveRate");
  const [selected, setSelected] = useState<StylistPerformance | null>(null);
  const [detailTab, setDetailTab] = useState<"summary" | "byday" | "whatif">("summary");

  const debouncedSearch = useDebounced(search, 250);

  // Persist target rate.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(TARGET_KEY));
      // Ignore corrupt/out-of-range persisted values (avoids "$NaN/hr").
      if (Number.isFinite(saved) && saved >= 11 && saved <= 29) setTargetPayRate(saved);
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      localStorage.setItem(TARGET_KEY, String(targetPayRate));
    } catch {
      /* ignore */
    }
  }, [targetPayRate]);

  const { query, performances, kpis, generatedAt } = useTeamDashboard({
    salonIds,
    targetPayRate,
    enabled: true,
    autoRefresh,
    // Locked visibility rule: off-PPH people render for Admin only (the API
    // also omits them for owner/manager — this is the client-side backstop).
    includeExcluded: currentUser.role === "admin",
  });

  // The week shown: the demo's frozen export week, or (live) whichever week the
  // backend returned — the latest with imported data unless asked otherwise.
  const weekStart = DEMO_MODE
    ? TEAM_WEEK.start
    : (query.data?.records[0]?.weekStart ?? "");
  const weekLabel = DEMO_MODE
    ? TEAM_WEEK.label
    : (query.data?.records[0]?.weekLabel ?? "…");

  const filters: TeamFilters = useMemo(
    () => ({ search: debouncedSearch, status, sort, view }),
    [debouncedSearch, status, sort, view],
  );
  const visible = useMemo(() => filterAndSortPerformances(performances, filters), [performances, filters]);

  const statusCounts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: performances.length,
      on_track: kpis.onTrackCount,
      needs_attention: kpis.needsAttentionCount,
      behind: kpis.behindCount,
    }),
    [performances.length, kpis],
  );

  const teamAvgRate = kpis.avgEffectiveRate;
  const attentionCount = kpis.needsAttentionCount + kpis.behindCount;

  // ── Telemetry ──────────────────────────────────────────────────────────
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!viewedRef.current && query.isSuccess) {
      viewedRef.current = true;
      track("team_dashboard_viewed", {
        role: currentUser.role,
        stylistCount: performances.length,
        target: targetPayRate,
      });
    }
  }, [query.isSuccess, currentUser.role, performances.length, targetPayRate]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const onDetails = useCallback((p: StylistPerformance) => {
    setDetailTab("summary");
    setSelected(p);
    track("team_stylist_details_opened", { stylistId: p.stylistId });
  }, []);

  const onWhatIf = useCallback((p: StylistPerformance) => {
    setDetailTab("whatif");
    setSelected(p);
    track("team_stylist_whatif_opened", { stylistId: p.stylistId });
  }, []);

  const onExport = useCallback(() => {
    const csv = performancesToCsv(visible);
    downloadFile(`team-dashboard-${weekStart}.csv`, csv);
    track("team_dashboard_export", { count: visible.length });
  }, [visible, weekStart]);

  const onRefresh = useCallback(() => {
    query.refetch();
    track("team_dashboard_refreshed", {});
  }, [query]);

  const changeTarget = useCallback((delta: number) => {
    setTargetPayRate((r) => {
      const tiers = getActiveTiers();
      const min = tiers[0].payRate;
      const max = tiers[tiers.length - 1].payRate;
      const next = Math.max(min, Math.min(max, r + delta));
      track("team_target_rate_changed", { target: next });
      return next;
    });
  }, []);

  const setStatusTracked = useCallback((s: StatusFilter) => {
    setStatus(s);
    track("team_dashboard_filtered", { status: s });
  }, []);

  const virtualize = visible.length > VIRTUALIZE_THRESHOLD;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Title + top actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-brand)]">Team Dashboard</h1>
          <p className="text-sm text-[var(--color-ink-faint)]">
            Week of {weekLabel} ·{" "}
            {seesAllSalons ? "All salons" : "Your team"} · {performances.length} stylists
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TargetControl target={targetPayRate} onChange={changeTarget} />
          <Button variant="outline" size="sm" onClick={onExport} aria-label="Export current view to CSV">
            <Download size={15} aria-hidden="true" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={query.isFetching}>
            <RefreshCw size={15} aria-hidden="true" className={cn(query.isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Meta row: last updated + auto refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-ink-faint)]">
        <span>
          {query.isFetching
            ? "Refreshing…"
            : generatedAt
              ? `Last updated ${new Date(generatedAt).toLocaleTimeString()}`
              : ""}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand)]"
          />
          Auto-refresh every 5 min
        </label>
      </div>

      {/* KPIs */}
      <SectionErrorBoundary section="KPIs">
        {query.isLoading ? (
          <KpiSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <TeamKPICard label="Total Stylists" value={num(kpis.totalStylists)} icon={<Users size={16} />} />
            <TeamKPICard
              label="Avg Effective Rate"
              value={<span className={RATE_TEXT[rateTone(teamAvgRate, targetPayRate)]}>{rate(teamAvgRate)}</span>}
              sub={`Target ${rate(targetPayRate)}/hr`}
              icon={<DollarSign size={16} />}
              tone="brand"
            />
            <TeamKPICard label="Total Production" value={money(kpis.totalProduction)} sub={weekLabel} icon={<TrendingUp size={16} />} />
            <TeamKPICard
              label="On Track"
              value={num(kpis.onTrackCount)}
              sub={`${kpis.needsAttentionCount} at risk · ${kpis.behindCount} behind`}
              icon={<Activity size={16} />}
              tone={kpis.behindCount > 0 ? "warning" : "success"}
            />
            <TeamKPICard
              label="Team Utilization"
              value={pct(kpis.teamUtilization)}
              sub={`${num(kpis.totalActualHours)}h worked`}
              icon={<Gauge size={16} />}
              tone={kpis.teamUtilization >= 0.85 ? "success" : kpis.teamUtilization >= 0.7 ? "warning" : "danger"}
            />
            <TeamKPICard label="Scheduled Hours" value={`${num(kpis.totalScheduledHours)}h`} icon={<CalendarClock size={16} />} />
          </div>
        )}
      </SectionErrorBoundary>

      {/* Needs attention callout */}
      {!query.isLoading && attentionCount > 0 && status === "all" && (
        <button
          onClick={() => setStatusTracked("needs_attention")}
          className="flex w-full items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] p-3 text-left transition hover:brightness-[0.98]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-warning)]/20 text-[var(--color-warning)]">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm">
            <b>{attentionCount}</b> {attentionCount === 1 ? "stylist needs" : "stylists need"} attention this week —{" "}
            {kpis.behindCount} behind, {kpis.needsAttentionCount} at risk.
          </span>
          <span className="shrink-0 text-sm font-medium text-[var(--color-warning)]">View →</span>
        </button>
      )}

      {/* Distribution */}
      {!query.isLoading && performances.length > 0 && (
        <SectionErrorBoundary section="distribution">
          <TeamDistribution distribution={kpis.distribution} total={performances.length} />
        </SectionErrorBoundary>
      )}

      {/* Filters + view toggles */}
      <div className="space-y-3">
        <TeamFiltersBar
          search={search}
          onSearch={setSearch}
          status={status}
          onStatus={setStatusTracked}
          sort={sort}
          onSort={setSort}
          counts={statusCounts}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            options={[
              { value: "actual", label: "Actual" },
              { value: "scheduled", label: "Scheduled" },
            ]}
            value={view}
            onChange={(v) => setView(v as PerfView)}
          />
          <Segmented
            options={[
              { value: "cards", label: "Cards" },
              { value: "table", label: "Table" },
            ]}
            value={layout}
            onChange={(v) => setLayout(v as Layout)}
          />
        </div>
      </div>

      {/* Main content */}
      <SectionErrorBoundary section="stylist list">
        {query.isError ? (
          <ErrorState message={query.error?.message} onRetry={onRefresh} />
        ) : query.isLoading ? (
          <CardsGridSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState hasStylists={performances.length > 0} onClear={() => { setSearch(""); setStatus("all"); }} />
        ) : layout === "table" ? (
          <StylistTableView perfs={visible} sort={sort} onSortChange={setSort} onDetails={onDetails} onWhatIf={onWhatIf} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <div
                key={p.id}
                style={virtualize ? { contentVisibility: "auto", containIntrinsicSize: "480px" } : undefined}
              >
                <StylistCard p={p} view={view} onDetails={onDetails} onWhatIf={onWhatIf} />
              </div>
            ))}
          </div>
        )}
      </SectionErrorBoundary>

      {/* Detail modal */}
      <SectionErrorBoundary section="details" fallback={() => null}>
        <StylistDetailModal
          perf={selected}
          teamAvgRate={teamAvgRate}
          open={selected !== null}
          onClose={() => setSelected(null)}
          initialTab={detailTab}
        />
      </SectionErrorBoundary>
    </div>
  );
}

function TargetControl({ target, onChange }: { target: number; onChange: (delta: number) => void }) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1"
      role="group"
      aria-label="Salon target pay rate"
    >
      <button
        onClick={() => onChange(-1)}
        aria-label="Decrease target rate"
        className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
      >
        <Minus size={15} />
      </button>
      <span className="px-1 text-sm font-semibold tabular-nums">
        Target ${target}
        <span className="text-[var(--color-ink-faint)]">/hr</span>
      </span>
      <button
        onClick={() => onChange(1)}
        aria-label="Increase target rate"
        className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <Card role="alert">
      <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-[var(--color-danger)]">
          <AlertTriangle size={24} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-semibold">Couldn&apos;t load team data</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">{message ?? "Please try again."}</p>
        </div>
        <Button variant="primary" size="sm" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> Retry
        </Button>
      </CardBody>
    </Card>
  );
}

function EmptyState({ hasStylists, onClear }: { hasStylists: boolean; onClear: () => void }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
          <Inbox size={26} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-semibold">{hasStylists ? "No stylists match your filters" : "No stylists scheduled this week"}</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            {hasStylists ? "Try clearing the search or status filter." : "Once schedules are published they'll appear here."}
          </p>
        </div>
        {hasStylists && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

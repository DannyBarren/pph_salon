"use client";

import { useMemo } from "react";
import { fetchTeamData } from "@/services/teamDashboardService";
import { deriveStylistPerformance, deriveTeamKPIs } from "@/lib/teamDerive";
import { TEAM_DASHBOARD_REFRESH_MS } from "@/lib/featureFlags";
import type { StylistPerformance, TeamFilters, TeamKPIs } from "@/lib/teamTypes";
import { useAsyncQuery, type UseAsyncQueryResult } from "./useAsyncQuery";
import type { TeamDataPayload } from "@/lib/teamTypes";

export interface UseTeamDashboardArgs {
  /** Salon scope for the current role (empty = all salons). */
  salonIds: string[];
  /** Salon/week target pay rate driving progress + status. */
  targetPayRate: number;
  /** Whether the query is allowed to run (role gate). */
  enabled: boolean;
  /** Poll every 5 minutes when true. */
  autoRefresh: boolean;
}

export interface UseTeamDashboardResult {
  query: UseAsyncQueryResult<TeamDataPayload>;
  performances: StylistPerformance[];
  kpis: TeamKPIs;
  generatedAt: string | null;
  source: TeamDataPayload["source"] | null;
}

/**
 * Fetches team data and derives per-stylist performance + team KPIs. Derivation
 * is memoized on the raw payload and target rate so recomputes are cheap.
 */
export function useTeamDashboard(args: UseTeamDashboardArgs): UseTeamDashboardResult {
  const { salonIds, targetPayRate, enabled, autoRefresh } = args;
  const salonKey = [...salonIds].sort().join(",") || "all";

  const query = useAsyncQuery<TeamDataPayload>({
    queryKey: `team-data:${salonKey}`,
    queryFn: (signal) => fetchTeamData({ salonIds, signal }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: autoRefresh ? TEAM_DASHBOARD_REFRESH_MS : false,
  });

  const performances = useMemo(() => {
    if (!query.data) return [];
    return query.data.records.map((r) => {
      try {
        return deriveStylistPerformance(r, targetPayRate);
      } catch {
        return null;
      }
    }).filter((p): p is StylistPerformance => p !== null);
  }, [query.data, targetPayRate]);

  const kpis = useMemo(() => deriveTeamKPIs(performances), [performances]);

  return {
    query,
    performances,
    kpis,
    generatedAt: query.data?.generatedAt ?? null,
    source: query.data?.source ?? null,
  };
}

/** Pure filter + sort applied to derived performances (memoize at call site). */
export function filterAndSortPerformances(
  perfs: StylistPerformance[],
  filters: TeamFilters,
): StylistPerformance[] {
  const search = filters.search.trim().toLowerCase();

  const filtered = perfs.filter((p) => {
    if (filters.status !== "all" && p.status !== filters.status) return false;
    if (search && !p.name.toLowerCase().includes(search) && !p.stylistId.includes(search)) return false;
    return true;
  });

  const gapToNext = (p: StylistPerformance) =>
    p.nextTier ? p.remainingToTarget.remainingProduction : Number.MAX_SAFE_INTEGER;

  const sorted = [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "effectiveRate":
        return b.effectiveRate - a.effectiveRate;
      case "production":
        return b.production - a.production;
      case "utilization":
        return b.utilization - a.utilization;
      case "gapToNext":
        return gapToNext(a) - gapToNext(b);
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  return sorted;
}

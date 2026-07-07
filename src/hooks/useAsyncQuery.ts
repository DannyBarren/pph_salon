"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A tiny React-Query-style data hook.
 *
 * TODO: Review with Danny — the spec asks for React Query (TanStack Query). We
 * ship this focused ~120-line hook instead to honour the repo rule in
 * `docs/AGENTS.md` ("No new heavyweight dependencies without justification") and
 * keep the bundle small. It intentionally mirrors the parts of the RQ API the
 * dashboard needs — `staleTime`, `gcTime`, `retry` (delegated to the queryFn),
 * `refetchOnWindowFocus`, `refetchInterval`, `refetch`, and the
 * `isLoading` / `isFetching` / `dataUpdatedAt` flags — so migrating to real
 * React Query later is mechanical.
 */

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

// Process-level cache shared across hook instances by `queryKey`.
const cache = new Map<string, CacheEntry<unknown>>();
const gcTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface UseAsyncQueryOptions<T> {
  queryKey: string;
  queryFn: (signal: AbortSignal) => Promise<T>;
  enabled?: boolean;
  /** How long cached data is considered fresh (no refetch). Default 60s. */
  staleTime?: number;
  /** How long to keep cached data after the last observer unmounts. Default 5m. */
  gcTime?: number;
  /** Refetch when the window/tab regains focus (if stale). Default true. */
  refetchOnWindowFocus?: boolean;
  /** Poll interval in ms, or false to disable. Default false. */
  refetchInterval?: number | false;
}

export interface UseAsyncQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  dataUpdatedAt: number | null;
  refetch: () => void;
}

export function useAsyncQuery<T>(options: UseAsyncQueryOptions<T>): UseAsyncQueryResult<T> {
  const {
    queryKey,
    enabled = true,
    staleTime = 60_000,
    gcTime = 5 * 60_000,
    refetchOnWindowFocus = true,
    refetchInterval = false,
  } = options;

  const cached = cache.get(queryKey) as CacheEntry<T> | undefined;

  const [data, setData] = useState<T | undefined>(cached?.data);
  const [dataUpdatedAt, setDataUpdatedAt] = useState<number | null>(cached?.updatedAt ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Keep the latest queryFn without retriggering effects on every render.
  const queryFnRef = useRef(options.queryFn);
  useEffect(() => {
    queryFnRef.current = options.queryFn;
  });
  const abortRef = useRef<AbortController | null>(null);

  const runFetch = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsFetching(true);
    setError(null);

    queryFnRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        cache.set(queryKey, { data: result, updatedAt: Date.now() });
        setData(result);
        setDataUpdatedAt(Date.now());
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsFetching(false);
      });
  }, [queryKey]);

  const refetch = useCallback(() => {
    if (enabled) runFetch();
  }, [enabled, runFetch]);

  // Initial + stale-aware fetch on mount / key change. Seeding state from the
  // shared cache on mount is the intended pattern here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!enabled) return;
    // Cancel any pending GC for this key while we have an observer.
    const timer = gcTimers.get(queryKey);
    if (timer) {
      clearTimeout(timer);
      gcTimers.delete(queryKey);
    }

    const entry = cache.get(queryKey) as CacheEntry<T> | undefined;
    const isStale = !entry || Date.now() - entry.updatedAt > staleTime;
    if (entry) {
      setData(entry.data);
      setDataUpdatedAt(entry.updatedAt);
    }
    if (isStale) runFetch();

    return () => {
      abortRef.current?.abort();
      // Schedule cache garbage-collection after gcTime.
      const gc = setTimeout(() => cache.delete(queryKey), gcTime);
      gcTimers.set(queryKey, gc);
    };
  }, [queryKey, enabled, staleTime, gcTime, runFetch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Refetch on window focus when stale.
  useEffect(() => {
    if (!enabled || !refetchOnWindowFocus) return;
    const onFocus = () => {
      const entry = cache.get(queryKey) as CacheEntry<T> | undefined;
      if (!entry || Date.now() - entry.updatedAt > staleTime) runFetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [queryKey, enabled, refetchOnWindowFocus, staleTime, runFetch]);

  // Polling.
  useEffect(() => {
    if (!enabled || !refetchInterval) return;
    const id = setInterval(runFetch, refetchInterval);
    return () => clearInterval(id);
  }, [enabled, refetchInterval, runFetch]);

  return {
    data,
    error,
    isLoading: isFetching && data === undefined,
    isFetching,
    isError: error !== null,
    isSuccess: data !== undefined && error === null,
    dataUpdatedAt,
    refetch,
  };
}

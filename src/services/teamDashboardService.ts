import { getTeamPayload } from "@/lib/teamData";
import type { TeamDataPayload } from "@/lib/teamTypes";

/**
 * Data layer for the Team Dashboard.
 *
 * Today this returns validated mock data derived from the Excel workbook. It is
 * intentionally shaped like a real network call — Promise-based, with artificial
 * latency and retry/backoff — so swapping in the live Zenoti (hours + service
 * sales) + PayCor (pay rates) integrations described in the workbook's "Inputs"
 * sheet is a drop-in change: replace `fetchPayload` and keep the same contract.
 *
 * TODO: Review with Danny — replace `fetchPayload` with the Zenoti + PayCor
 * clients. Keep the Zod-lite validation in `getTeamPayload` (or move it here) so
 * malformed upstream rows are dropped rather than crashing the UI.
 */

export interface FetchOptions {
  /** Restrict to these salon ids (role scoping). Empty/undefined = all. */
  salonIds?: string[];
  /** Retry attempts on failure (default 3). */
  retries?: number;
  /** Injected failure probability for testing resilience (0-1, default 0). */
  failureRate?: number;
  /** Abort signal to cancel an in-flight request. */
  signal?: AbortSignal;
}

const MIN_LATENCY_MS = 600;
const MAX_LATENCY_MS = 900;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fetchPayload(opts: FetchOptions): Promise<TeamDataPayload> {
  // Simulate network latency (600–900ms).
  const latency = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS);
  await delay(latency, opts.signal);

  if (opts.failureRate && Math.random() < opts.failureRate) {
    throw new Error("Upstream data source unavailable");
  }

  const payload = getTeamPayload();
  const scoped = opts.salonIds && opts.salonIds.length > 0
    ? payload.records.filter((r) => opts.salonIds!.includes(r.salonId))
    : payload.records;

  return { ...payload, records: scoped };
}

/**
 * Fetch the team payload with exponential backoff (base 400ms → 800ms → 1600ms).
 * Aborted requests reject immediately and are not retried.
 */
export async function fetchTeamData(opts: FetchOptions = {}): Promise<TeamDataPayload> {
  const retries = opts.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchPayload(opts);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err;
      const isLast = attempt === retries - 1;
      if (isLast) break;
      const backoff = 400 * 2 ** attempt;
      await delay(backoff, opts.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to load team data");
}

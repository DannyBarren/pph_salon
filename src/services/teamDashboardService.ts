import { getTeamPayload } from "@/lib/teamData";
import type { TeamDataPayload, StylistWeekRecord } from "@/lib/teamTypes";
import { DEMO_MODE } from "@/lib/featureFlags";
import { performanceApi } from "@/lib/api/endpoints";
import type { TeamWeekDTO } from "@/lib/api/types";
import { weekdayIndex } from "@/lib/time";

/**
 * Data layer for the Team Dashboard.
 *
 * In the live app (`NEXT_PUBLIC_DEMO_MODE=false`) the payload comes from the
 * backend's `GET /performance/team-week` (Postgres), scoped to the caller's
 * visibility. In demo mode it returns validated mock data derived from the
 * Excel workbook, intentionally shaped like a real network call — Promise-based,
 * with artificial latency and retry/backoff.
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

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const HUES = [265, 200, 150, 25, 330, 95, 305, 55];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

/** Map the backend team-week payload to the dashboard's record contract. */
function liveRecords(dto: TeamWeekDTO): StylistWeekRecord[] {
  const weekLabel = `${shortDate(dto.week_start)} – ${shortDate(dto.week_end)}`;
  return dto.records.map((r) => ({
    id: `u${r.stylist_id}`,
    stylistId: r.employee_code ?? `u${r.stylist_id}`,
    name: r.name,
    title: r.title ?? "Stylist",
    salonId: `s${r.salon_id}`,
    hue: HUES[r.stylist_id % HUES.length],
    guaranteeRate: r.guarantee_rate,
    weekStart: r.week_start,
    weekEnd: r.week_end,
    weekLabel,
    days: r.daily.map((d) => ({
      date: d.date,
      label: DAY_LABELS[weekdayIndex(d.date)] ?? "",
      scheduledHours: d.scheduled_hrs,
      actualHours: d.actual_hrs ?? 0,
      production: d.actual_production ?? 0,
      haircuts: d.haircuts ?? 0,
      colors: d.colors ?? 0,
    })),
  }));
}

/** Live payload from Postgres via the backend (production mode). */
async function fetchLivePayload(opts: FetchOptions): Promise<TeamDataPayload> {
  const dto = await performanceApi.teamWeek();
  const records = liveRecords(dto);
  const scoped = opts.salonIds && opts.salonIds.length > 0
    ? records.filter((r) => opts.salonIds!.includes(r.salonId))
    : records;
  return { records: scoped, generatedAt: dto.generated_at, source: "api" };
}

async function fetchPayload(opts: FetchOptions): Promise<TeamDataPayload> {
  if (!DEMO_MODE) return fetchLivePayload(opts);

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

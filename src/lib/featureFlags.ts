/**
 * Feature flags. This is a Next.js app, so client-readable env vars use the
 * `NEXT_PUBLIC_` prefix (the spec's `VITE_FEATURE_TEAM_DASHBOARD` is the Vite
 * equivalent). Set `NEXT_PUBLIC_FEATURE_TEAM_DASHBOARD=false` to hide the Team
 * Dashboard; it defaults to **on** so the demo works with no configuration.
 *
 * TODO: Review with Danny — document this var in a `.env.example` if/when the
 * repo adds one.
 */
export const FEATURE_TEAM_DASHBOARD =
  process.env.NEXT_PUBLIC_FEATURE_TEAM_DASHBOARD !== "false";

/** Auto-refresh interval for the dashboard (ms). */
export const TEAM_DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

/**
 * Temporarily-disabled features (soft-disable).
 *
 * These features are hidden from the running app but ALL of their code (pages,
 * components, services, models, API routes, tests) intentionally remains in the
 * repo for future use. Each flag gates: the nav link, the route/page, and any
 * remaining UI reference.
 *
 * To RE-ENABLE a feature later, either flip its constant here to `true` (a
 * one-line change) or set the matching `NEXT_PUBLIC_*` env var to `"true"`.
 * Defaults are OFF.
 */
export const ENABLE_PLANNER = process.env.NEXT_PUBLIC_ENABLE_PLANNER === "true";
export const ENABLE_CALENDAR = process.env.NEXT_PUBLIC_ENABLE_CALENDAR === "true";
export const ENABLE_GOALS = process.env.NEXT_PUBLIC_ENABLE_GOALS === "true";
export const ENABLE_GOALS_NOTIFICATIONS =
  process.env.NEXT_PUBLIC_ENABLE_GOALS_NOTIFICATIONS === "true";

/**
 * Demo mode is **opt-in**. Only the exact string `"true"` turns on the
 * credential-free playground (mock data, localStorage, instant account
 * switcher, no login). Unset / missing / `""` / `"false"` / `"0"` (and any
 * other value) all mean **live mode**: Sign in, JWT, no switcher, FastAPI.
 *
 * The sandbox on `main` still sets `NEXT_PUBLIC_DEMO_MODE=true`. This
 * production branch must never hydrate into Demo just because the env is
 * missing. Backend `ENVIRONMENT=production` independently force-sets
 * `demo_mode=False`.
 */
export function isDemoModeEnabled(raw: string | undefined | null): boolean {
  return raw === "true";
}

export const DEMO_MODE = isDemoModeEnabled(process.env.NEXT_PUBLIC_DEMO_MODE);

/** Base URL of the FastAPI backend, including the `/api/v1` prefix. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

/** Full v1 API root used by the API client. */
export const API_V1_URL = API_BASE_URL.endsWith("/api/v1")
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

/** Sentry DSN placeholder — telemetry is a no-op until this is set. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

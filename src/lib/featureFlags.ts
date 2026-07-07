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

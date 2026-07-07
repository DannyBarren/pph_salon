/**
 * Lightweight analytics placeholder. Swap the implementation for a real sink
 * (Segment, PostHog, Amplitude…) without touching call sites.
 *
 * TODO: Review with Danny — wire this to the production analytics provider.
 */

export type TelemetryEvent =
  | "team_dashboard_viewed"
  | "team_dashboard_filtered"
  | "team_dashboard_refreshed"
  | "team_dashboard_export"
  | "team_stylist_details_opened"
  | "team_stylist_whatif_opened"
  | "team_target_rate_changed";

export function track(event: TelemetryEvent, props: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === "production") {
    // No-op until a real analytics provider is connected.
    return;
  }
  if (typeof console !== "undefined") {
    console.debug(`[telemetry] ${event}`, props);
  }
}

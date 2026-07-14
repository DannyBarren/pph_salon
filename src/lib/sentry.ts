/**
 * Sentry placeholder. The real `@sentry/nextjs` SDK is intentionally not a hard
 * dependency; this module gives the app a single, safe hook to initialise error
 * reporting when `NEXT_PUBLIC_SENTRY_DSN` is configured. Wire it up by installing
 * `@sentry/nextjs` and replacing the body of `initSentry` with `Sentry.init(...)`.
 */

import { SENTRY_DSN } from "@/lib/featureFlags";

let initialised = false;

export function initSentry(): void {
  if (initialised || !SENTRY_DSN || typeof window === "undefined") return;
  initialised = true;
  // Placeholder — swap for the real SDK in production:
  //   import * as Sentry from "@sentry/nextjs";
  //   Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
  console.info("[sentry] error reporting configured (placeholder). DSN present.");
}

export function captureException(error: unknown): void {
  if (!SENTRY_DSN) return;
  // Placeholder — forwards to console until the SDK is wired.
  console.error("[sentry] captureException:", error);
}

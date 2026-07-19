"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { initSentry } from "@/lib/sentry";

/** Routes that render standalone (no app chrome / auth gate). */
const BARE_ROUTES = ["/login", "/register", "/setup", "/accept-invite"];

/**
 * Top-level frame: initialises telemetry + PWA, shows the offline banner, and
 * decides between the bare (auth) layout and the full app shell behind the gate.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  useEffect(() => {
    initSentry();
  }, []);

  return (
    <>
      <OfflineIndicator />
      <ServiceWorkerRegister />
      {bare ? (
        children
      ) : (
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      )}
    </>
  );
}

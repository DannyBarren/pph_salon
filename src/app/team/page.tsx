"use client";

import React from "react";
import { useApp } from "@/store/AppContext";
import { TimeNavigator } from "@/components/TimeNavigator";
import { TeamOverview } from "@/components/TeamOverview";
import { TeamDashboard } from "@/components/team/TeamDashboard";
import { SectionErrorBoundary } from "@/components/team/ErrorBoundary";
import { Card, CardBody } from "@/components/ui/primitives";
import { FEATURE_TEAM_DASHBOARD } from "@/lib/featureFlags";

export default function TeamPage() {
  const { currentUser } = useApp();

  // Route guard: team data is protected — stylists cannot access it.
  if (currentUser.role === "stylist") {
    return (
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">Team view</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            This area is only available to salon managers and ownership.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (FEATURE_TEAM_DASHBOARD) {
    return (
      <SectionErrorBoundary section="team dashboard">
        <TeamDashboard />
      </SectionErrorBoundary>
    );
  }

  // Fallback to the legacy overview when the feature flag is disabled.
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {currentUser.role === "sdl" ? "Everyone" : "My Team"}
        </h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Performance &amp; adoption {currentUser.role === "sdl" ? "across all salons" : "for your direct reports"}.
        </p>
      </div>
      <TimeNavigator />
      <TeamOverview />
    </div>
  );
}

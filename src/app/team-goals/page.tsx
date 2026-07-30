"use client";

import React from "react";
import { useApp } from "@/store/AppContext";
import { TeamGoals } from "@/components/TeamGoals";
import { Card, CardBody } from "@/components/ui/primitives";
import { FeatureUnavailable } from "@/components/FeatureUnavailable";
import { ENABLE_GOALS } from "@/lib/featureFlags";

export default function TeamGoalsPage() {
  // Soft-disabled (see featureFlags.ts). Set ENABLE_GOALS=true to re-enable.
  if (!ENABLE_GOALS) return <FeatureUnavailable title="Goals" />;
  return <TeamGoalsView />;
}

function TeamGoalsView() {
  const { currentUser } = useApp();

  // Route guard: stylists manage their own goal on the Planner, not here.
  if (currentUser.role === "stylist") {
    return (
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">Team Goals</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            This area is for managers and ownership. Set your own goal on the Planner.
          </p>
        </CardBody>
      </Card>
    );
  }

  return <TeamGoals />;
}

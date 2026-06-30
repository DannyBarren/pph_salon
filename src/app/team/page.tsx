"use client";

import React from "react";
import { useApp } from "@/store/AppContext";
import { TimeNavigator } from "@/components/TimeNavigator";
import { TeamOverview } from "@/components/TeamOverview";
import { Card, CardBody } from "@/components/ui/primitives";

export default function TeamPage() {
  const { currentUser } = useApp();

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {currentUser.role === "sdl" ? "Everyone" : "My Team"}
        </h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Performance & adoption {currentUser.role === "sdl" ? "across all salons" : "for your direct reports"}.
        </p>
      </div>
      <TimeNavigator />
      <TeamOverview />
    </div>
  );
}

"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/store/AppContext";
import { StylistSwitcher } from "@/components/StylistSwitcher";
import { StylistDashboard } from "@/components/StylistDashboard";
import { Card, CardBody } from "@/components/ui/primitives";
import { FEATURE_TEAM_DASHBOARD } from "@/lib/featureFlags";

export default function DashboardPage() {
  const { currentUser, viewedStylistId } = useApp();
  const router = useRouter();

  // Role-based default landing: managers/owners/SDLs land on the Team Dashboard.
  const redirectToTeam = FEATURE_TEAM_DASHBOARD && currentUser.role !== "stylist";
  useEffect(() => {
    if (redirectToTeam) router.replace("/team");
  }, [redirectToTeam, router]);

  if (redirectToTeam) {
    return <div className="py-20 text-center text-sm text-[var(--color-ink-faint)]">Opening Team Dashboard…</div>;
  }

  const targetId = currentUser.role === "stylist" ? currentUser.id : viewedStylistId;

  return (
    <div className="space-y-4">
      {currentUser.role !== "stylist" && <StylistSwitcher />}
      {targetId ? (
        <StylistDashboard key={targetId} stylistId={targetId} />
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-ink-faint)]">Select a stylist to view their dashboard.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

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

  // Managers / SDL / Admin land on the Team Dashboard (management views). An
  // excluded stylist gets a "not on the PPH plan" notice below instead of a
  // personal pay dashboard.
  const isExcluded = !!currentUser.excluded;
  const redirectToTeam = FEATURE_TEAM_DASHBOARD && currentUser.role !== "stylist";
  useEffect(() => {
    if (redirectToTeam) router.replace("/team");
  }, [redirectToTeam, router]);

  if (redirectToTeam) {
    return <div className="py-20 text-center text-sm text-[var(--color-ink-faint)]">Opening Team Dashboard…</div>;
  }

  // An excluded stylist has no team and is not on the PPH plan → no personal
  // pay/PPH dashboard.
  if (currentUser.role === "stylist" && isExcluded) {
    return (
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">Not on the PPH pay plan</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            Your account is marked as excluded from the PPH pay plan, so there&apos;s no personal PPH
            dashboard to show. Reach out to your manager or administrator if you believe this is a mistake.
          </p>
        </CardBody>
      </Card>
    );
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

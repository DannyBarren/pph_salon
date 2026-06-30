"use client";

import React from "react";
import { useApp } from "@/store/AppContext";
import { TimeNavigator } from "@/components/TimeNavigator";
import { StylistSwitcher } from "@/components/StylistSwitcher";
import { StylistDashboard } from "@/components/StylistDashboard";
import { Card, CardBody } from "@/components/ui/primitives";

export default function DashboardPage() {
  const { currentUser, viewedStylistId } = useApp();
  const targetId = currentUser.role === "stylist" ? currentUser.id : viewedStylistId;

  return (
    <div className="space-y-4">
      <TimeNavigator />
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

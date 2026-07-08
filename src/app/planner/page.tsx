"use client";

import React from "react";
import { useApp } from "@/store/AppContext";
import { StylistSwitcher } from "@/components/StylistSwitcher";
import { GoalPlanner } from "@/components/GoalPlanner";
import { Card, CardBody } from "@/components/ui/primitives";

export default function PlannerPage() {
  const { currentUser, viewedStylistId } = useApp();
  const targetId = currentUser.role === "stylist" ? currentUser.id : viewedStylistId;

  return (
    <div className="space-y-4">
      {currentUser.role !== "stylist" && <StylistSwitcher />}
      {targetId ? (
        <GoalPlanner key={targetId} stylistId={targetId} />
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-ink-faint)]">Select a stylist to plan for.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

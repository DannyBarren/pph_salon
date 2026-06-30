"use client";

import React from "react";
import { Lock } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { AdminConfigPanel } from "@/components/AdminConfigPanel";
import { DataInputPanel } from "@/components/DataInputPanel";
import { Card, CardBody } from "@/components/ui/primitives";

export default function AdminPage() {
  const { currentUser } = useApp();

  if (currentUser.role !== "sdl") {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <Lock size={20} className="text-[var(--color-ink-faint)]" />
          <div>
            <h2 className="text-base font-semibold">Admin configuration</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              Only the SDL / Owner can edit pay parameters and import data. Switch to the owner account to access this.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Configuration</h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Control the pay engine and import production data. Everything updates the app instantly.
        </p>
      </div>
      <AdminConfigPanel />
      <DataInputPanel />
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { Calculator, ChevronRight, Lock, ShieldAlert } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { DataManagementPanel } from "@/components/DataManagementPanel";
import { DataInputPanel } from "@/components/DataInputPanel";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { Card, CardBody } from "@/components/ui/primitives";
import { DEMO_MODE } from "@/lib/featureFlags";

export default function AdminPage() {
  const { currentUser } = useApp();

  if (currentUser.role !== "admin") {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <Lock size={20} className="text-[var(--color-ink-faint)]" />
          <div>
            <h2 className="text-base font-semibold">Admin configuration</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              Only the Admin role can manage salons, users, imports, and pay
              configuration.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Manage salons, provision users (single or bulk CSV), configure pay plans,
          import performance data, and review the audit trail.
        </p>
      </div>

      {/* Dedicated, org-wide payment-logic controls (highest admin only). */}
      <Link href="/admin/payment-logic" className="block">
        <Card className="border-[var(--color-brand)]/40 transition hover:border-[var(--color-brand)] hover:shadow-sm">
          <CardBody className="flex items-center gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)] text-white">
              <Calculator size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Payment Logic</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                  <ShieldAlert size={12} /> Danger Zone
                </span>
              </div>
              <p className="mt-0.5 text-sm text-[var(--color-ink-faint)]">
                Change the payment tier table, rates, prices and formulas that drive every number for every user
                and location. Global only.
              </p>
            </div>
            <ChevronRight size={20} className="shrink-0 text-[var(--color-ink-faint)]" />
          </CardBody>
        </Card>
      </Link>

      {/* Real, Postgres-backed management (works in demo + production). */}
      <AdminManagement />

      {/* Legacy in-memory demo controls — hidden in production where all state
          lives in Postgres via the API above. */}
      {DEMO_MODE && (
        <>
          <div className="pt-2">
            <h2 className="text-lg font-semibold tracking-tight">Demo data playground</h2>
            <p className="text-sm text-[var(--color-ink-faint)]">
              Local-only controls for the offline demo dataset (not persisted to the backend).
            </p>
          </div>
          <DataManagementPanel />
          <DataInputPanel />
        </>
      )}
    </div>
  );
}

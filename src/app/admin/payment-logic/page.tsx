"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { PaymentLogicPanel } from "@/components/admin/PaymentLogicPanel";
import { Card, CardBody } from "@/components/ui/primitives";

/**
 * Dedicated, highest-admin-only page for the organisation-wide payment logic.
 *
 * Visible and usable ONLY by the top admin (SDL / Owner). Everyone else — even
 * managers — sees a locked message. Changes made here apply to the entire user
 * population and every location (global only; no per-salon / per-user variants).
 */
export default function PaymentLogicPage() {
  const { currentUser } = useApp();

  if (currentUser.role !== "admin") {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <Lock size={20} className="text-[var(--color-ink-faint)]" />
          <div>
            <h2 className="text-base font-semibold">Payment logic</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              Only the Admin role can view or change the global payment logic and calculations.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] transition hover:text-[var(--color-brand)]"
        >
          <ArrowLeft size={16} /> Back to Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Payment Logic</h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          The single, organization-wide source of truth for every pay calculation shown to every user.
        </p>
      </div>
      <PaymentLogicPanel />
    </div>
  );
}

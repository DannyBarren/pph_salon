"use client";

import React from "react";
import { Lock } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { useAuth } from "@/store/AuthContext";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { Card, CardBody } from "@/components/ui/primitives";

/**
 * Manager-facing staff management. Managers are responsible for provisioning
 * their own subordinate (stylist) accounts. The backend confines every action
 * here to the manager's salon and forces the stylist to report to them, so this
 * page only needs to expose the create/import/list UI (no salon or role pickers).
 */
export default function StaffPage() {
  const { currentUser } = useApp();
  const { user } = useAuth();

  if (currentUser.role === "stylist") {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <Lock size={20} className="text-[var(--color-ink-faint)]" />
          <div>
            <h2 className="text-base font-semibold">Team management</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              Only managers and above can add or manage team members.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Team</h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Add your stylists with their employee code. They start as Pending
          setup — use Activate to paste their email and copy the setup link.
        </p>
      </div>
      <AdminManagement mode="manager" defaultSalonId={user?.salon_id} />
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Check, ChevronDown, Repeat2, ShieldCheck, Store, Users } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { DEMO_ACCOUNT_IDS, USERS, salonById, stylistsForUser, userById } from "@/lib/mockData";
import type { Role, User } from "@/lib/types";
import { Avatar, Badge, Modal } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const roleMeta: Record<Role, { label: string; tone: "brand" | "success" | "warning"; icon: React.ReactNode; blurb: (u: User) => string }> = {
  stylist: { label: "Stylist", tone: "brand", icon: <Store size={14} />, blurb: (u) => `${salonById(u.salonId).name} · sees only their own data` },
  manager: { label: "Salon Manager", tone: "warning", icon: <Users size={14} />, blurb: (u) => `${stylistsForUser(u).length} direct reports · team view` },
  sdl: { label: "SDL · Owner", tone: "success", icon: <ShieldCheck size={14} />, blurb: () => `Full access across every salon` },
};

export function AccountSwitcher() {
  const { currentUser, setCurrentUserId } = useApp();
  const [open, setOpen] = useState(false);
  const meta = roleMeta[currentUser.role];

  const demoAccounts = DEMO_ACCOUNT_IDS.map((id) => userById(id)!).filter(Boolean);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-1 pr-2 transition hover:bg-[var(--color-surface-2)] sm:pr-3"
      >
        <Avatar initials={currentUser.initials} hue={currentUser.hue} size={34} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold">{currentUser.name}</span>
          <span className="block text-xs text-[var(--color-ink-faint)]">{meta.label}</span>
        </span>
        <ChevronDown size={16} className="text-[var(--color-ink-faint)]" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Switch demo account">
        <p className="-mt-2 mb-4 flex items-center gap-1.5 text-sm text-[var(--color-ink-faint)]">
          <Repeat2 size={15} /> No login needed — tap any persona to instantly re-scope the app.
        </p>
        <div className="space-y-2">
          {demoAccounts.map((u) => {
            const m = roleMeta[u.role];
            const active = u.id === currentUser.id;
            return (
              <button
                key={u.id}
                onClick={() => {
                  setCurrentUserId(u.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                  active
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                <Avatar initials={u.initials} hue={u.hue} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{u.name}</span>
                    <Badge tone={m.tone}>
                      {m.icon}
                      {m.label}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-[var(--color-ink-faint)]">{m.blurb(u)}</div>
                </div>
                {active && <Check size={18} className="text-[var(--color-brand)]" />}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
          {USERS.filter((u) => u.role === "stylist").length} stylists · {USERS.filter((u) => u.role === "manager").length} managers · 1 owner in the dataset
        </p>
      </Modal>
    </>
  );
}

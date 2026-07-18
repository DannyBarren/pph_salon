"use client";

import React, { useState } from "react";
import { Check, ChevronDown, LogOut, Repeat2, Search, ShieldCheck, Store, Users } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { useAuth } from "@/store/AuthContext";
import { SALONS, USERS, salonById, stylistsForUser } from "@/lib/mockData";
import type { Role, User } from "@/lib/types";
import { Avatar, Badge, Modal } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const roleMeta: Record<Role, { label: string; tone: "brand" | "success" | "warning"; icon: React.ReactNode; blurb: (u: User) => string }> = {
  stylist: { label: "Stylist", tone: "brand", icon: <Store size={14} />, blurb: (u) => `${salonById(u.salonId).name} · sees only their own data` },
  manager: { label: "Salon Manager", tone: "warning", icon: <Users size={14} />, blurb: (u) => `${salonById(u.salonId).name} · ${stylistsForUser(u).length} reports` },
  sdl: { label: "SDL · Owner", tone: "success", icon: <ShieldCheck size={14} />, blurb: () => `Full access across every salon` },
};

/** Production user menu: identity + sign out (no demo persona switching). */
function UserMenu() {
  const { currentUser } = useApp();
  const { logout } = useAuth();
  const meta = roleMeta[currentUser.role];
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-right leading-tight sm:block">
        <span className="block text-sm font-semibold">{currentUser.name}</span>
        <span className="block text-xs text-[var(--color-ink-faint)]">{meta.label}</span>
      </span>
      <Avatar initials={currentUser.initials} hue={currentUser.hue} size={34} />
      <button
        onClick={logout}
        aria-label="Sign out"
        className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
      >
        <LogOut size={14} />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}

function AccountRow({ u, active, onPick }: { u: User; active: boolean; onPick: (id: string) => void }) {
  const m = roleMeta[u.role];
  return (
    <button
      onClick={() => onPick(u.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition",
        active ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]" : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]",
      )}
    >
      <Avatar initials={u.initials} hue={u.hue} size={38} />
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
      {active && <Check size={18} className="shrink-0 text-[var(--color-brand)]" />}
    </button>
  );
}

export function AccountSwitcher() {
  const { currentUser, setCurrentUserId } = useApp();
  const { demoMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const meta = roleMeta[currentUser.role];

  // Production: real identity + logout, no instant persona switching.
  if (!demoMode) return <UserMenu />;

  const pick = (id: string) => {
    setCurrentUserId(id);
    setOpen(false);
    setQuery("");
  };

  const owners = USERS.filter((u) => u.role === "sdl");
  const q = query.trim().toLowerCase();
  const matches = (u: User) =>
    !q || u.name.toLowerCase().includes(q) || salonById(u.salonId).name.toLowerCase().includes(q);

  const stylistCount = USERS.filter((u) => u.role === "stylist").length;
  const managerCount = USERS.filter((u) => u.role === "manager").length;

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

      <Modal open={open} onClose={() => setOpen(false)} title="View any account" size="lg">
        <p className="-mt-2 mb-3 flex items-center gap-1.5 text-sm text-[var(--color-ink-faint)]">
          <Repeat2 size={15} /> No login needed — tap any salon, manager or stylist to view their real data.
        </p>

        <div className="mb-3 flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3">
          <Search size={16} className="text-[var(--color-ink-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or salon…"
            className="h-10 w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {/* Owner / POC */}
          {owners.filter(matches).length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Organization</div>
              {owners.filter(matches).map((u) => (
                <AccountRow key={u.id} u={u} active={u.id === currentUser.id} onPick={pick} />
              ))}
            </div>
          )}

          {/* Every salon: manager(s) first, then stylists */}
          {SALONS.map((salon) => {
            const members = USERS.filter((u) => u.salonId === salon.id && u.role !== "sdl" && matches(u)).sort(
              (a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "manager" ? -1 : 1),
            );
            if (members.length === 0) return null;
            return (
              <div key={salon.id} className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                  <Store size={12} /> {salon.name} · {salon.city}
                </div>
                {members.map((u) => (
                  <AccountRow key={u.id} u={u} active={u.id === currentUser.id} onPick={pick} />
                ))}
              </div>
            );
          })}

          {owners.filter(matches).length === 0 &&
            SALONS.every((s) => USERS.filter((u) => u.salonId === s.id && u.role !== "sdl" && matches(u)).length === 0) && (
              <p className="py-6 text-center text-sm text-[var(--color-ink-faint)]">No accounts match “{query}”.</p>
            )}
        </div>

        <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
          {SALONS.length} salons · {managerCount} managers · {stylistCount} stylists · 1 owner — all viewable without credentials
        </p>
      </Modal>
    </>
  );
}

"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sliders, Users, Settings, Sparkles, Megaphone, Flag, CalendarDays, Tag, Bell, Calculator } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { cn } from "@/lib/cn";
import { visiblePostsFor } from "@/lib/messaging";
import { ROLE_LABEL } from "@/lib/roles";
import {
  ENABLE_CALENDAR,
  ENABLE_GOALS,
  ENABLE_GOALS_NOTIFICATIONS,
  ENABLE_PLANNER,
  FEATURE_TEAM_DASHBOARD,
} from "@/lib/featureFlags";
import type { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
  /** When false, the item is soft-disabled and hidden from the nav. */
  enabled?: boolean;
}

// With the Team Dashboard flag on, managers/SDL use it as their home and the
// personal Dashboard is stylist-only. With the flag off we keep the original
// nav. The Board (announcements) tab is available to everyone in both layouts.
const ALL: Role[] = ["stylist", "manager", "sdl", "admin"];
const NAV: NavItem[] = FEATURE_TEAM_DASHBOARD
  ? [
      { href: "/", label: "Dashboard", icon: <LayoutDashboard size={20} />, roles: ["stylist"] },
      { href: "/team", label: "Team", icon: <Users size={20} />, roles: ["manager", "sdl", "admin"] },
      { href: "/planner", label: "Planner", icon: <Sliders size={20} />, roles: ALL, enabled: ENABLE_PLANNER },
      { href: "/calendar", label: "Calendar", icon: <CalendarDays size={20} />, roles: ALL, enabled: ENABLE_CALENDAR },
      { href: "/team-goals", label: "Goals", icon: <Flag size={20} />, roles: ["manager", "sdl"], enabled: ENABLE_GOALS },
      { href: "/board", label: "Board", icon: <Megaphone size={20} />, roles: ALL },
      { href: "/promotions", label: "Promotions", icon: <Tag size={20} />, roles: ALL },
      { href: "/admin/payment-logic", label: "Pay Logic", icon: <Calculator size={20} />, roles: ["admin"] },
      { href: "/admin", label: "Admin", icon: <Settings size={20} />, roles: ["admin"] },
    ]
  : [
      { href: "/", label: "Dashboard", icon: <LayoutDashboard size={20} />, roles: ALL },
      { href: "/planner", label: "Planner", icon: <Sliders size={20} />, roles: ALL, enabled: ENABLE_PLANNER },
      { href: "/calendar", label: "Calendar", icon: <CalendarDays size={20} />, roles: ALL, enabled: ENABLE_CALENDAR },
      { href: "/team-goals", label: "Goals", icon: <Flag size={20} />, roles: ["manager", "sdl"], enabled: ENABLE_GOALS },
      { href: "/board", label: "Board", icon: <Megaphone size={20} />, roles: ALL },
      { href: "/promotions", label: "Promotions", icon: <Tag size={20} />, roles: ALL },
      { href: "/team", label: "Team", icon: <Users size={20} />, roles: ["manager", "sdl", "admin"] },
      { href: "/admin/payment-logic", label: "Pay Logic", icon: <Calculator size={20} />, roles: ["admin"] },
      { href: "/admin", label: "Admin", icon: <Settings size={20} />, roles: ["admin"] },
    ];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, ready, boardPosts, boardLastSeen, notifications } = useApp();
  const pathname = usePathname();
  // Excluded users (not on the PPH plan) never see the personal Dashboard tab.
  const items = NAV.filter(
    (n) =>
      n.roles.includes(currentUser.role) &&
      n.enabled !== false &&
      !(n.href === "/" && currentUser.excluded),
  );

  // `/admin` is matched exactly so its `/admin/payment-logic` child doesn't also
  // light up the Admin tab; other routes match by prefix.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // Unread announcements = posts the user can see, newer than their last visit,
  // and not authored by them. Computed only after mount (`ready`) to avoid SSR
  // hydration drift from the wall clock.
  const unread = useMemo(() => {
    if (!ready) return 0;
    const nowIso = new Date().toISOString();
    const seen = boardLastSeen[currentUser.id] ?? "";
    return visiblePostsFor(currentUser, boardPosts, nowIso).filter(
      (p) => p.authorId !== currentUser.id && p.createdAt > seen,
    ).length;
  }, [ready, boardPosts, boardLastSeen, currentUser]);

  // Unread goal notifications for the current user (badge on the Goals tab).
  const goalUnread = useMemo(
    () => (ready ? notifications.filter((n) => n.recipientId === currentUser.id && !n.isRead).length : 0),
    [ready, notifications, currentUser.id],
  );

  const badgeFor = (href: string) => (href === "/board" ? unread : href === "/team-goals" ? goalUnread : 0);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-brand)] text-white">
              <Sparkles size={18} />
            </span>
            <span className="hidden text-lg font-bold tracking-tight sm:block">
              PPH<span className="text-[var(--color-brand)]"> Stylist</span>
            </span>
          </Link>

          {/* Subtle role indicator */}
          <span
            className="ml-1 hidden rounded-full bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ink-soft)] sm:inline-flex"
            aria-label={`Signed in as ${ROLE_LABEL[currentUser.role]}`}
          >
            {ROLE_LABEL[currentUser.role]}
          </span>

          {/* Desktop nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition",
                  isActive(n.href)
                    ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-ink)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                {n.icon}
                {n.label}
                {badgeFor(n.href) > 0 && (
                  <span className="ml-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[11px] font-bold text-white">
                    {badgeFor(n.href)}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {ENABLE_GOALS_NOTIFICATIONS && (
              <Link
                href="/notifications"
                aria-label={goalUnread > 0 ? `Notifications, ${goalUnread} unread` : "Notifications"}
                className="relative grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
              >
                <Bell size={18} />
                {goalUnread > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
                    {goalUnread}
                  </span>
                )}
              </Link>
            )}
            <AccountSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:pb-10">
        {ready ? children : <div className="py-20 text-center text-sm text-[var(--color-ink-faint)]">Loading…</div>}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition",
                isActive(n.href) ? "text-[var(--color-brand)]" : "text-[var(--color-ink-faint)]",
              )}
            >
              <span className="relative">
                {n.icon}
                {badgeFor(n.href) > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
                    {badgeFor(n.href)}
                  </span>
                )}
              </span>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

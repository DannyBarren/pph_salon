"use client";

import React, { useMemo, useState } from "react";
import { Flag, Check, X, Bell, ChevronRight, Store, Users } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { ALL_STYLISTS, SALONS, salonById, userById } from "@/lib/mockData";
import { CURRENT_WEEK, fmtRange } from "@/lib/time";
import { Card, CardBody, Badge, Button, Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { Goal, GoalApprovalStatus, User } from "@/lib/types";

const STATUS_META: Record<GoalApprovalStatus, { label: string; tone: "neutral" | "success" | "danger" }> = {
  pending: { label: "Pending", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  disapproved: { label: "Needs changes", tone: "danger" },
};
// Safe lookup — unknown/legacy status falls back to "pending" (never crashes).
const statusMeta = (s: GoalApprovalStatus) => STATUS_META[s] ?? STATUS_META.pending;

/**
 * Team Goals — managers review their direct reports' goals; SDL/Owner get a
 * cascading Store → Manager → Stylist hierarchy. Goals carry no revenue/$, so
 * this view is privacy-safe by construction.
 */
export function TeamGoals() {
  const { currentUser } = useApp();
  const isSdl = currentUser.role === "sdl";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--color-brand)]">
          <Flag size={24} /> Team Goals
        </h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Pay period {fmtRange(CURRENT_WEEK.start, CURRENT_WEEK.end)} ·{" "}
          {isSdl ? "Drill down across the organization." : "Review and approve your team's goals."}
        </p>
      </div>

      <NotificationsPanel />

      {isSdl ? <HierarchyView /> : <ManagerTeamView manager={currentUser} />}
    </div>
  );
}

/* ── Notifications ─────────────────────────────────────────────── */

function NotificationsPanel() {
  const { currentUser, notifications, markNotificationRead } = useApp();
  const mine = useMemo(
    () => notifications.filter((n) => n.recipientId === currentUser.id).slice(0, 8),
    [notifications, currentUser.id],
  );
  const unread = mine.filter((n) => !n.isRead).length;

  if (mine.length === 0) return null;

  return (
    <Card>
      <CardBody>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Bell size={16} className="text-[var(--color-brand)]" /> Notifications
          {unread > 0 && <Badge tone="brand">{unread} new</Badge>}
        </div>
        <ul className="space-y-1.5">
          {mine.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
                n.isRead ? "border-[var(--color-border)]" : "border-[var(--color-brand)]/40 bg-[var(--color-brand-soft)]",
              )}
            >
              <span>{n.message}</span>
              {!n.isRead && (
                <button
                  onClick={() => markNotificationRead(n.id)}
                  className="shrink-0 text-xs font-medium text-[var(--color-brand)] hover:underline"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ── Manager view: direct reports ──────────────────────────────── */

function ManagerTeamView({ manager }: { manager: User }) {
  const reports = useMemo(() => ALL_STYLISTS.filter((s) => s.managerId === manager.id), [manager.id]);
  if (reports.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-[var(--color-ink-faint)]">
          You have no direct reports.
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {reports.map((s) => (
        <StylistGoalCard key={s.id} stylist={s} canReview />
      ))}
    </div>
  );
}

/* ── SDL/Owner: cascading Store → Manager → Stylist accordion ───── */

function HierarchyView() {
  return (
    <div className="space-y-3">
      {SALONS.map((salon) => {
        const salonManagers = MANAGERS_IN_SALON(salon.id);
        return (
          <Card key={salon.id}>
            <details open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-semibold">
                <ChevronRight size={16} className="transition group-open:rotate-90" />
                <Store size={16} className="text-[var(--color-brand)]" /> {salon.name}
                <span className="text-xs font-normal text-[var(--color-ink-faint)]">· {salon.city}</span>
              </summary>
              <div className="space-y-3 px-4 pb-4">
                {salonManagers.length === 0 && (
                  <p className="text-sm text-[var(--color-ink-faint)]">No managers in this store.</p>
                )}
                {salonManagers.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-[var(--color-border)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Users size={15} className="text-[var(--color-brand)]" /> {m.name}
                    </div>
                    <div className="space-y-2">
                      {ALL_STYLISTS.filter((s) => s.managerId === m.id).map((s) => (
                        <StylistGoalCard key={s.id} stylist={s} canReview compact />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}

function MANAGERS_IN_SALON(salonId: string): User[] {
  // Managers are Users with role "manager" in the salon.
  const ids = new Set(ALL_STYLISTS.filter((s) => s.salonId === salonId).map((s) => s.managerId));
  return Array.from(ids)
    .map((id) => (id ? userById(id) : undefined))
    .filter((u): u is User => !!u && u.role === "manager");
}

/* ── Per-stylist goal card with review controls ────────────────── */

function StylistGoalCard({ stylist, canReview, compact }: { stylist: User; canReview?: boolean; compact?: boolean }) {
  const { getActiveGoal, getGoalHistory, reviewGoal, currentUser } = useApp();
  const active = getActiveGoal(stylist.id, CURRENT_WEEK.start);
  const previous = active?.previousGoalId
    ? getGoalHistory(stylist.id, CURRENT_WEEK.start).find((g) => g.id === active.previousGoalId)
    : undefined;

  // Prefill with any existing comment so a re-review is an easy edit.
  const [comment, setComment] = useState(active?.managerComment ?? "");
  const [flash, setFlash] = useState<GoalApprovalStatus | null>(null);
  const mayReview = canReview && (currentUser.role === "sdl" || stylist.managerId === currentUser.id);
  const reviewer = active?.reviewedBy ? userById(active.reviewedBy) : undefined;

  const submitReview = (status: GoalApprovalStatus) => {
    if (!active) return;
    reviewGoal(active.id, status, comment.trim() || undefined);
    setFlash(status);
    setTimeout(() => setFlash(null), 2500);
  };

  return (
    <Card className={cn(!compact && "shadow-none")}>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar initials={stylist.initials} hue={stylist.hue} size={compact ? 32 : 40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{stylist.name}</span>
              <span className="text-xs text-[var(--color-ink-faint)]">{salonById(stylist.salonId).name}</span>
            </div>
            {active ? (
              <Badge tone={statusMeta(active.approvalStatus).tone}>{statusMeta(active.approvalStatus).label}</Badge>
            ) : (
              <span className="text-xs text-[var(--color-ink-faint)]">No goal set yet</span>
            )}
          </div>
        </div>

        {active && (
          <>
            <GoalRow label="Current goal" goal={active} highlight />
            {previous && <GoalRow label="Previous (overridden)" goal={previous} muted />}

            {/* Review controls — prominent, prefilled, and re-reviewable. */}
            {mayReview && (
              <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {active.reviewedAt ? "Update your review" : "Review this goal"}
                  </span>
                  {flash && (
                    <span className="animate-pop text-xs font-medium text-[var(--color-success)]">
                      ✓ {flash === "approved" ? "Approved" : "Disapproved"} — stylist notified
                    </span>
                  )}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.replace(/[<>]/g, ""))}
                  rows={2}
                  placeholder="Add a comment for the stylist (optional)…"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
                />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => submitReview("approved")}>
                    <Check size={15} /> Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => submitReview("disapproved")}>
                    <X size={15} /> Disapprove
                  </Button>
                </div>
                {active.reviewedAt && (
                  <p className="text-[11px] text-[var(--color-ink-faint)]">
                    Last reviewed by {reviewer?.name ?? "you"} ·{" "}
                    {new Date(active.reviewedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Read-only comment view for non-reviewers (e.g. SDL browsing). */}
            {!mayReview && active.managerComment && (
              <p className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                <b>Manager comment:</b> {active.managerComment}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function GoalRow({ label, goal, highlight, muted }: { label: string; goal: Goal; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={cn("rounded-xl p-2.5", highlight && "bg-[var(--color-brand-soft)]", muted && "opacity-70")}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">
        PPH {goal.targetPph} · {goal.targetHours}h · {goal.targetHaircuts} cuts · {goal.targetColors} colors
      </div>
    </div>
  );
}

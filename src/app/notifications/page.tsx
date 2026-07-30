"use client";

import React, { useMemo } from "react";
import { Bell, BellOff, Check, Flag, Sparkles } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { Card, CardBody, Button, Badge } from "@/components/ui/primitives";
import type { NotificationType } from "@/lib/types";
import { FeatureUnavailable } from "@/components/FeatureUnavailable";
import { ENABLE_GOALS_NOTIFICATIONS } from "@/lib/featureFlags";

const META: Record<NotificationType, { icon: React.ReactNode; tone: "brand" | "success" | "warning" }> = {
  goal_set: { icon: <Flag size={16} />, tone: "brand" },
  goal_updated: { icon: <Sparkles size={16} />, tone: "warning" },
  goal_reviewed: { icon: <Check size={16} />, tone: "success" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  // Goals notifications are soft-disabled (see featureFlags.ts).
  // Set ENABLE_GOALS_NOTIFICATIONS=true to re-enable.
  if (!ENABLE_GOALS_NOTIFICATIONS) return <FeatureUnavailable title="Notifications" />;
  return <NotificationsView />;
}

function NotificationsView() {
  const { currentUser, notifications, markNotificationRead } = useApp();

  const mine = useMemo(
    () =>
      notifications
        .filter((n) => n.recipientId === currentUser.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications, currentUser.id],
  );
  const unread = mine.filter((n) => !n.isRead);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bell size={22} /> Notifications
          </h1>
          <p className="text-sm text-[var(--color-ink-faint)]">
            {unread.length > 0 ? `${unread.length} unread` : "You're all caught up"}
          </p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => unread.forEach((n) => markNotificationRead(n.id))}>
            <Check size={14} /> Mark all read
          </Button>
        )}
      </div>

      {mine.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <BellOff size={30} className="text-[var(--color-ink-faint)]" />
            <p className="text-sm text-[var(--color-ink-faint)]">No notifications yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {mine.map((n) => {
            const meta = META[n.type] ?? META.goal_set;
            return (
              <Card key={n.id} className={n.isRead ? "opacity-70" : ""}>
                <CardBody className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.isRead ? "bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]" : "bg-[var(--color-brand-soft)] text-[var(--color-brand-ink)]"}`}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{n.message}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-[var(--color-ink-faint)]">{timeAgo(n.createdAt)}</span>
                      {!n.isRead && <Badge tone={meta.tone}>New</Badge>}
                    </div>
                  </div>
                  {!n.isRead && (
                    <Button variant="ghost" size="sm" onClick={() => markNotificationRead(n.id)}>
                      <Check size={14} /> Read
                    </Button>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

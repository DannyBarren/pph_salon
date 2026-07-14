"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Megaphone, Sparkles, Target, Pin, TrendingUp } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { Card, CardBody, Button, Badge } from "@/components/ui/primitives";
import { visiblePostsFor } from "@/lib/messaging";

/**
 * Promotions hub: surfaces pinned salon announcements as live promotions and
 * offers a "flash goal" call-to-action into the planner. Promotions reuse the
 * message-board model (pinned posts) so managers/owners can publish them from
 * the Board with no extra tooling.
 */
export default function PromotionsPage() {
  const { currentUser, boardPosts } = useApp();

  const promos = useMemo(() => {
    const nowIso = new Date().toISOString();
    return visiblePostsFor(currentUser, boardPosts, nowIso).filter((p) => p.isPinned);
  }, [currentUser, boardPosts]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Megaphone size={22} /> Promotions
        </h1>
        <p className="text-sm text-[var(--color-ink-faint)]">
          Live salon promotions and a flash goal to make the most of them.
        </p>
      </div>

      {/* Flash goal CTA */}
      <Card className="overflow-hidden border-none bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-ink)] text-white">
        <CardBody className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20">
              <Target size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold">Set a flash goal</h2>
              <p className="text-sm text-white/85">Turn a promotion into extra production this week.</p>
            </div>
          </div>
          <Link href="/planner">
            <Button variant="soft" className="bg-white text-[var(--color-brand-ink)] hover:bg-white">
              <Sparkles size={16} /> Open planner
            </Button>
          </Link>
        </CardBody>
      </Card>

      {/* Promo list */}
      {promos.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <TrendingUp size={30} className="text-[var(--color-ink-faint)]" />
            <p className="text-sm text-[var(--color-ink-faint)]">
              No active promotions right now. Pinned announcements on the Board appear here.
            </p>
            <Link href="/board">
              <Button variant="outline" size="sm">
                <Megaphone size={14} /> Go to Board
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {promos.map((p) => (
            <Card key={p.id}>
              <CardBody>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="brand">
                    <Pin size={12} /> Promotion
                  </Badge>
                  <span className="text-xs text-[var(--color-ink-faint)]">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-base font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{p.content}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

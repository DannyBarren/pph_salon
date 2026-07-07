"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Pin,
  Plus,
  ThumbsUp,
  Check,
  Clock,
  Users,
  ChevronDown,
  CalendarOff,
  CircleDot,
} from "lucide-react";
import { useApp } from "@/store/AppContext";
import { SALONS, salonById, userById } from "@/lib/mockData";
import {
  ackStats,
  audienceOptionsFor,
  canPost,
  hasAcknowledged,
  targetedStylistIds,
  visiblePostsFor,
  isExpired,
} from "@/lib/messaging";
import type { MessageBoardPost, Role, TargetAudience } from "@/lib/types";
import { Card, CardBody, Button, Badge, Avatar, Modal, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const ROLE_LABEL: Record<Role, string> = { stylist: "Stylist", manager: "Manager", sdl: "SDL · Owner" };

/**
 * Message Board / Announcements. One-way posts (no replies). Stylists read +
 * acknowledge; managers/SDLs post and see acknowledgment stats. Visibility and
 * targeting follow `src/lib/messaging.ts`.
 */
export function MessageBoard() {
  const { currentUser, boardPosts, boardLastSeen, markBoardSeen } = useApp();
  const [composing, setComposing] = useState(false);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  // Snapshot "last seen" at mount so unread highlighting is stable while we
  // immediately mark the board as seen (which clears the nav badge).
  const [seenSnapshot] = useState(() => ({ ...boardLastSeen }));
  const seenForUser = seenSnapshot[currentUser.id] ?? "";
  useEffect(() => {
    markBoardSeen();
  }, [currentUser.id, markBoardSeen]);

  const posts = useMemo(
    () => visiblePostsFor(currentUser, boardPosts, nowIso),
    [currentUser, boardPosts, nowIso],
  );

  const canAuthor = canPost(currentUser.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--color-brand)]">
            <Megaphone size={24} /> Message Board
          </h1>
          <p className="text-sm text-[var(--color-ink-faint)]">
            {canAuthor
              ? "Post announcements and track who's seen them."
              : "Announcements from your salon and leadership. Tap to acknowledge."}
          </p>
        </div>
        {canAuthor && (
          <Button onClick={() => setComposing(true)}>
            <Plus size={16} /> New Post
          </Button>
        )}
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-16 text-center">
            <Megaphone size={28} className="text-[var(--color-ink-faint)]" />
            <p className="text-sm text-[var(--color-ink-faint)]">No announcements yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              unread={post.authorId !== currentUser.id && post.createdAt > seenForUser}
              nowIso={nowIso}
            />
          ))}
        </div>
      )}

      {composing && <NewPostModal onClose={() => setComposing(false)} />}
    </div>
  );
}

/* ─────────────────────────── Post card ─────────────────────────── */

function PostCard({ post, unread, nowIso }: { post: MessageBoardPost; unread: boolean; nowIso: string }) {
  const { currentUser, boardAcks, acknowledgePost } = useApp();
  const author = userById(post.authorId);
  const acked = hasAcknowledged(post.id, currentUser.id, boardAcks);
  const expired = isExpired(post, nowIso);

  const isStylist = currentUser.role === "stylist";
  const isSender = post.authorId === currentUser.id || currentUser.role === "manager" || currentUser.role === "sdl";

  return (
    <Card
      className={cn(
        "transition",
        post.isPinned && "border-[var(--color-brand)]/40",
        unread && "ring-2 ring-[var(--color-brand)]/30",
      )}
    >
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          {author && <Avatar initials={author.initials} hue={author.hue} size={40} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{post.title}</h2>
              {post.isPinned && (
                <Badge tone="brand">
                  <Pin size={11} /> Pinned
                </Badge>
              )}
              {unread && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)]">
                  <CircleDot size={11} /> New
                </span>
              )}
              {expired && <Badge tone="neutral">Expired</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-ink-faint)]">
              <span className="font-medium text-[var(--color-ink-soft)]">{author?.name ?? "Unknown"}</span>
              <span>· {ROLE_LABEL[post.authorRole]}</span>
              <span>· {formatWhen(post.createdAt)}</span>
              <AudienceLabel audience={post.targetAudience} />
            </div>
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink-soft)]">{post.content}</p>

        {/* Stylist: acknowledge. Senders: acknowledgment stats. */}
        {isStylist ? (
          <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-3">
            {acked ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-success-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-success)]">
                <Check size={16} /> Acknowledged
              </span>
            ) : (
              <Button onClick={() => acknowledgePost(post.id)}>
                <ThumbsUp size={16} /> Acknowledge
              </Button>
            )}
          </div>
        ) : isSender ? (
          <AckStatsBlock post={post} />
        ) : null}
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Ack stats (senders) ─────────────────────────── */

function AckStatsBlock({ post }: { post: MessageBoardPost }) {
  const { boardAcks } = useApp();
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => ackStats(post, boardAcks), [post, boardAcks]);

  const targeted = useMemo(() => targetedStylistIds(post), [post]);
  const ackedIds = useMemo(
    () => new Set(boardAcks.filter((a) => a.postId === post.id).map((a) => a.userId)),
    [boardAcks, post.id],
  );

  return (
    <div className="border-t border-[var(--color-border)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users size={15} className="text-[var(--color-brand)]" />
          {stats.acknowledged}/{stats.total} stylists acknowledged
          <span className="text-[var(--color-ink-faint)]">({stats.percent}%)</span>
        </div>
        {stats.total > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand)]"
            aria-expanded={open}
          >
            Details <ChevronDown size={14} className={cn("transition", open && "rotate-180")} />
          </button>
        )}
      </div>
      <div className="mt-2 max-w-md">
        <Progress value={stats.total ? stats.acknowledged / stats.total : 0} tone="success" />
      </div>
      {open && (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {targeted.map((id) => {
            const u = userById(id);
            const done = ackedIds.has(id);
            return (
              <li key={id} className="flex items-center gap-2 text-sm">
                {done ? (
                  <Check size={14} className="text-[var(--color-success)]" />
                ) : (
                  <Clock size={14} className="text-[var(--color-ink-faint)]" />
                )}
                <span className={cn(done ? "text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]")}>
                  {u?.name ?? id}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AudienceLabel({ audience }: { audience: TargetAudience }) {
  let text: string;
  if (audience.kind === "all") text = "· All salons";
  else if (audience.kind === "salons")
    text = `· ${audience.salonIds.map((id) => salonById(id)?.name ?? id).join(", ")}`;
  else text = `· ${audience.userIds.length} people`;
  return <span className="inline-flex items-center gap-1">{text}</span>;
}

/* ─────────────────────────── New post modal ─────────────────────────── */

function NewPostModal({ onClose }: { onClose: () => void }) {
  const { currentUser, createPost } = useApp();
  const opts = audienceOptionsFor(currentUser.role);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"all" | "salons">(opts.kinds[0]);
  const [salonIds, setSalonIds] = useState<string[]>(
    currentUser.role === "manager" ? [currentUser.salonId] : [SALONS[0].id],
  );
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const canSubmit = title.trim().length > 0 && (kind === "all" || salonIds.length > 0 || !opts.canChoose);

  const submit = () => {
    let audience: TargetAudience;
    if (!opts.canChoose) {
      audience = { kind: "salons", salonIds: [currentUser.salonId] };
    } else if (kind === "all") {
      audience = { kind: "all" };
    } else {
      audience = { kind: "salons", salonIds };
    }
    createPost({
      title,
      content,
      targetAudience: audience,
      isPinned,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="New announcement">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--color-ink-soft)]">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Saturday huddle @ 9am"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-brand)]"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--color-ink-soft)]">Message</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Write your announcement…"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm outline-none focus:border-[var(--color-brand)]"
          />
        </label>

        {/* Smart audience selector */}
        <div>
          <span className="mb-1 block text-sm font-medium text-[var(--color-ink-soft)]">Audience</span>
          {!opts.canChoose ? (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-[var(--color-ink-soft)]">
              <Users size={15} className="text-[var(--color-brand)]" />
              My salon · {salonById(currentUser.salonId).name} (all your stylists)
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <AudienceChip active={kind === "all"} onClick={() => setKind("all")} label="All salons" />
                <AudienceChip active={kind === "salons"} onClick={() => setKind("salons")} label="Specific salon(s)" />
              </div>
              {kind === "salons" && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {SALONS.map((s) => {
                    const checked = salonIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                          checked ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]" : "border-[var(--color-border)]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSalonIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id)))
                          }
                          className="h-4 w-4 accent-[var(--color-brand)]"
                        />
                        {s.name} · {s.city}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm">
            <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
            <Pin size={15} className="text-[var(--color-brand)]" /> Pin to top
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)]">
              <CalendarOff size={14} /> Expires (optional)
            </span>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            <Megaphone size={16} /> Post announcement
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AudienceChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active
          ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand-ink)]"
          : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]",
      )}
    >
      {label}
    </button>
  );
}

/** Compact absolute date-time label, e.g. "Jun 24, 2:30 PM". */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

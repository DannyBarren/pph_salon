import type { MessageAcknowledgment, MessageBoardPost, Role, User } from "./types";
import { ALL_STYLISTS } from "./mockData";
import { canPostAnnouncements } from "./roles";

/**
 * Message board visibility, targeting, and acknowledgment helpers (frontend
 * mirror of `backend/app/services/messaging.py`). Pure functions so the store,
 * nav badge, and screens all share one source of truth.
 *
 * Role hierarchy: sdl (owner/SDL) > manager > stylist (see `src/lib/roles.ts`).
 */

/** Roles allowed to author announcements (managers and above). */
export function canPost(role: Role): boolean {
  return canPostAnnouncements(role);
}

/** Org-wide roles see the full organization (all posts). */
export function isOrgWide(role: Role): boolean {
  return role === "sdl";
}

export function isExpired(post: MessageBoardPost, nowIso: string): boolean {
  return post.expiresAt != null && post.expiresAt < nowIso;
}

/** Whether a post's audience payload explicitly includes the user. */
export function postTargetsUser(post: MessageBoardPost, user: User): boolean {
  const aud = post.targetAudience;
  if (aud.kind === "users") return aud.userIds.includes(user.id);
  if (aud.kind === "salons") return aud.salonIds.includes(user.salonId);
  // "all": a manager's "all" means their salon; org-wide means everyone.
  if (post.authorRole === "manager") return post.salonId === null || user.salonId === post.salonId;
  return true;
}

/** Whether a user may see a post (hierarchy + targeting + expiry). */
export function canView(post: MessageBoardPost, user: User, nowIso: string): boolean {
  if (post.authorId === user.id) return true;
  if (isExpired(post, nowIso)) return false;
  if (isOrgWide(user.role)) return true; // full-org overview
  if (user.role === "manager") {
    if (post.salonId === user.salonId) return true;
    if (post.targetAudience.kind === "salons" && post.targetAudience.salonIds.includes(user.salonId)) return true;
  }
  return postTargetsUser(post, user);
}

/** Posts visible to a user, pinned first then newest first. */
export function visiblePostsFor(
  user: User,
  posts: MessageBoardPost[],
  nowIso: string,
): MessageBoardPost[] {
  return posts
    .filter((p) => canView(p, user, nowIso))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/** Stylist ids a post is aimed at (the acknowledgment denominator). */
export function targetedStylistIds(post: MessageBoardPost): string[] {
  const aud = post.targetAudience;
  const stylists = ALL_STYLISTS;
  if (aud.kind === "users") return stylists.filter((s) => aud.userIds.includes(s.id)).map((s) => s.id);
  if (aud.kind === "salons") return stylists.filter((s) => aud.salonIds.includes(s.salonId)).map((s) => s.id);
  // "all"
  if (post.authorRole === "manager" && post.salonId) {
    return stylists.filter((s) => s.salonId === post.salonId).map((s) => s.id);
  }
  return stylists.map((s) => s.id);
}

export interface AckStats {
  acknowledged: number;
  total: number;
  percent: number;
}

/** Acknowledgment stats for a post across its targeted stylists. */
export function ackStats(post: MessageBoardPost, acks: MessageAcknowledgment[]): AckStats {
  const targeted = new Set(targetedStylistIds(post));
  const total = targeted.size;
  const acknowledged = new Set(
    acks.filter((a) => a.postId === post.id && targeted.has(a.userId)).map((a) => a.userId),
  ).size;
  return { acknowledged, total, percent: total ? Math.round((100 * acknowledged) / total) : 0 };
}

export function hasAcknowledged(postId: string, userId: string, acks: MessageAcknowledgment[]): boolean {
  return acks.some((a) => a.postId === postId && a.userId === userId);
}

export interface AudienceOptions {
  /** Whether the author may choose the audience at all (managers are locked). */
  canChoose: boolean;
  /** Available targeting kinds for this role. */
  kinds: Array<"all" | "salons">;
}

/** Audience selector configuration, smart per role. */
export function audienceOptionsFor(role: Role): AudienceOptions {
  if (role === "sdl") return { canChoose: true, kinds: ["all", "salons"] };
  // Managers are auto-limited to their salon; no selector.
  return { canChoose: false, kinds: ["salons"] };
}

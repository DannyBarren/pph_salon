"""Message board visibility, targeting, and acknowledgment logic.

Pure-ish helpers (they take an explicit ``Session``) shared by the API and the
tests. Visibility follows the role hierarchy (owner/admin > manager > stylist)
plus each post's explicit ``target_audience`` payload.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.models import (
    MessageAcknowledgment,
    MessageBoardPost,
    User,
    UserRole,
)
from app.models.base import utcnow

# Roles allowed to author posts.
POSTER_ROLES = {UserRole.manager, UserRole.admin}
# Top-level roles with full-organization visibility.
ORG_WIDE_ROLES = {UserRole.admin}
try:  # 'owner' only exists once the weekly-data migration is applied.
    POSTER_ROLES.add(UserRole.owner)  # type: ignore[attr-defined]
    ORG_WIDE_ROLES.add(UserRole.owner)  # type: ignore[attr-defined]
except AttributeError:  # pragma: no cover
    pass


def can_post(user: User) -> bool:
    """Whether a user may author announcements."""
    return user.role in POSTER_ROLES


def is_expired(post: MessageBoardPost, now: datetime | None = None) -> bool:
    if post.expires_at is None:
        return False
    now = now or utcnow()
    # Compare naive/aware safely by coercing to naive UTC when needed.
    exp = post.expires_at
    if exp.tzinfo is not None and now.tzinfo is None:
        now = now.replace(tzinfo=exp.tzinfo)
    if exp.tzinfo is None and now.tzinfo is not None:
        exp = exp.replace(tzinfo=now.tzinfo)
    return exp < now


def post_targets_user(post: MessageBoardPost, user: User) -> bool:
    """Whether ``post``'s audience payload explicitly includes ``user``."""
    aud = post.target_audience or {"kind": "all"}
    kind = aud.get("kind", "all")
    if kind == "users":
        return user.id in (aud.get("userIds") or [])
    if kind == "salons":
        return user.salon_id in (aud.get("salonIds") or [])
    # "all": for a manager this means their salon; for org-wide roles, everyone.
    if post.author_role == str(UserRole.manager):
        return post.salon_id is None or user.salon_id == post.salon_id
    return True


def can_view(post: MessageBoardPost, user: User) -> bool:
    """Whether ``user`` may see ``post`` (hierarchy + targeting)."""
    if post.author_id == user.id:
        return True
    if is_expired(post):
        return False
    # Org-wide roles see everything (full organization overview).
    if user.role in ORG_WIDE_ROLES:
        return True
    # Managers oversee their salon: see anything scoped to it.
    if user.role == UserRole.manager:
        if post.salon_id == user.salon_id:
            return True
        aud = post.target_audience or {}
        if user.salon_id in (aud.get("salonIds") or []):
            return True
    return post_targets_user(post, user)


def get_posts_for_user(session: Session, user: User) -> list[MessageBoardPost]:
    """Posts visible to ``user``, pinned first then newest first."""
    posts = session.exec(select(MessageBoardPost)).all()
    visible = [p for p in posts if can_view(post=p, user=user)]
    visible.sort(key=lambda p: (not p.is_pinned, -(p.id or 0)))
    return visible


def targeted_stylist_ids(session: Session, post: MessageBoardPost) -> list[int]:
    """Stylist ids the post is aimed at (the acknowledgment denominator)."""
    aud = post.target_audience or {"kind": "all"}
    kind = aud.get("kind", "all")
    stmt = select(User).where(User.role == UserRole.stylist)
    stylists = session.exec(stmt).all()

    if kind == "users":
        ids = set(aud.get("userIds") or [])
        return [s.id for s in stylists if s.id in ids]
    if kind == "salons":
        salon_ids = set(aud.get("salonIds") or [])
        return [s.id for s in stylists if s.salon_id in salon_ids]
    # "all"
    if post.author_role == str(UserRole.manager) and post.salon_id is not None:
        return [s.id for s in stylists if s.salon_id == post.salon_id]
    return [s.id for s in stylists]


def acknowledgment_stats(session: Session, post: MessageBoardPost) -> dict[str, int]:
    """{'acknowledged', 'total', 'percent'} for a post's targeted stylists."""
    total = len(targeted_stylist_ids(session, post))
    acked = len(
        session.exec(
            select(MessageAcknowledgment).where(MessageAcknowledgment.post_id == post.id)
        ).all()
    )
    percent = round(100 * acked / total) if total else 0
    return {"acknowledged": acked, "total": total, "percent": percent}


def has_acknowledged(session: Session, post_id: int, user_id: int) -> bool:
    row = session.exec(
        select(MessageAcknowledgment).where(
            MessageAcknowledgment.post_id == post_id,
            MessageAcknowledgment.user_id == user_id,
        )
    ).first()
    return row is not None


def acknowledge_post(
    session: Session, post_id: int, user_id: int, *, commit: bool = True
) -> MessageAcknowledgment:
    """Idempotently record that ``user_id`` acknowledged ``post_id``."""
    existing = session.exec(
        select(MessageAcknowledgment).where(
            MessageAcknowledgment.post_id == post_id,
            MessageAcknowledgment.user_id == user_id,
        )
    ).first()
    if existing is not None:
        return existing
    ack = MessageAcknowledgment(post_id=post_id, user_id=user_id)
    session.add(ack)
    if commit:
        session.commit()
        session.refresh(ack)
    return ack


def normalize_audience_for_role(user: User, audience: dict | None) -> tuple[dict, int | None]:
    """Constrain a requested audience to what the author's role may target.

    Returns ``(audience, salon_id)``. Managers are auto-limited to their own
    salon regardless of the requested payload; org-wide roles may target all,
    specific salons, or specific users.
    """
    audience = audience or {"kind": "all"}
    if user.role == UserRole.manager:
        # Managers can only reach their own salon.
        return {"kind": "salons", "salonIds": [user.salon_id]}, user.salon_id

    kind = audience.get("kind", "all")
    if kind == "salons":
        salon_ids = [int(s) for s in (audience.get("salonIds") or [])]
        salon = salon_ids[0] if len(salon_ids) == 1 else None
        return {"kind": "salons", "salonIds": salon_ids}, salon
    if kind == "users":
        return {"kind": "users", "userIds": [int(u) for u in (audience.get("userIds") or [])]}, None
    return {"kind": "all"}, None

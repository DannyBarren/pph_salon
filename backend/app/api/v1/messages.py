"""Message board / announcements endpoints.

Role rules:
- Stylists: read + acknowledge only.
- Managers: post to their salon + view acknowledgments.
- SDL / owner / admin: broad targeting + full-organization visibility.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.db.session import get_session
from app.models import MessageBoardPost, User
from app.schemas.message import (
    AckDetail,
    AckRead,
    AckStats,
    PostAckDetail,
    PostCreate,
    PostRead,
)
from app.services import messaging

router = APIRouter(prefix="/messages", tags=["messages"])


def _to_read(session: Session, post: MessageBoardPost, viewer: User) -> PostRead:
    stats = messaging.acknowledgment_stats(session, post)
    author = session.get(User, post.author_id)
    return PostRead(
        id=post.id,
        author_id=post.author_id,
        author_name=author.name if author else None,
        author_role=post.author_role,
        salon_id=post.salon_id,
        target_audience=post.target_audience or {"kind": "all"},
        title=post.title,
        content=post.content,
        created_at=post.created_at,
        expires_at=post.expires_at,
        is_pinned=post.is_pinned,
        stats=AckStats(**stats),
        acknowledged_by_me=messaging.has_acknowledged(session, post.id, viewer.id),
    )


@router.get("", response_model=list[PostRead])
def list_posts(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PostRead]:
    """Posts visible to the caller (pinned first, newest first)."""
    posts = messaging.get_posts_for_user(session, current)
    return [_to_read(session, p, current) for p in posts]


@router.post("", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: PostCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PostRead:
    """Create an announcement. Managers are auto-scoped to their salon."""
    if not messaging.can_post(current):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only managers and above can post")

    audience, salon_id = messaging.normalize_audience_for_role(current, payload.target_audience)
    post = MessageBoardPost(
        author_id=current.id,
        author_role=str(current.role),
        salon_id=salon_id,
        target_audience=audience,
        title=payload.title,
        content=payload.content,
        expires_at=payload.expires_at,
        is_pinned=payload.is_pinned,
    )
    session.add(post)
    session.commit()
    session.refresh(post)
    return _to_read(session, post, current)


@router.post("/{post_id}/acknowledge", response_model=AckRead)
def acknowledge(
    post_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AckRead:
    """Acknowledge a post the caller can see (idempotent)."""
    post = session.get(MessageBoardPost, post_id)
    if post is None or not messaging.can_view(post, current):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    ack = messaging.acknowledge_post(session, post_id, current.id)
    return AckRead.model_validate(ack)


@router.get("/{post_id}/acknowledgments", response_model=PostAckDetail)
def acknowledgment_detail(
    post_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PostAckDetail:
    """Acknowledgment breakdown for senders (author or manager+ overseeing it)."""
    post = session.get(MessageBoardPost, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    is_author = post.author_id == current.id
    if not (is_author or messaging.can_post(current)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to view acknowledgments")

    stats = messaging.acknowledgment_stats(session, post)
    targeted = set(messaging.targeted_stylist_ids(session, post))
    acks = post.acknowledgments
    acked_ids = {a.user_id for a in acks}
    details = []
    for a in acks:
        u = session.get(User, a.user_id)
        details.append(
            AckDetail(
                id=a.id, post_id=a.post_id, user_id=a.user_id,
                acknowledged_at=a.acknowledged_at, user_name=u.name if u else None,
            )
        )
    pending = sorted(targeted - acked_ids)
    return PostAckDetail(stats=AckStats(**stats), acknowledgments=details, pending_user_ids=pending)

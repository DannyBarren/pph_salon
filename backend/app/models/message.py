"""Message board / announcements models.

One-way announcements posted by managers / SDLs / owners and read (and, for
stylists, acknowledged) downstream. Visibility follows the role hierarchy and an
explicit ``target_audience`` payload; see ``app.services.messaging`` for the
resolution logic.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin, utcnow

if TYPE_CHECKING:
    from app.models.user import User


def default_audience() -> dict:
    """Default targeting: everyone the author's role can reach."""
    return {"kind": "all"}


class MessageBoardPost(TimestampMixin, table=True):
    __tablename__ = "message_board_post"

    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="users.id", index=True)
    # Snapshot of the author's role at post time (for display + downstream rules).
    author_role: str = Field(index=True)
    # Optional salon scope. Null means "not scoped to a single salon" (the
    # target_audience payload carries the real targeting).
    salon_id: Optional[int] = Field(default=None, foreign_key="salon.id", index=True)

    # Targeting payload, e.g.:
    #   {"kind": "all"}
    #   {"kind": "salons", "salonIds": [1, 2]}
    #   {"kind": "users", "userIds": [10, 11]}
    target_audience: dict = Field(default_factory=default_audience, sa_column=Column(JSON, nullable=False))

    title: str
    content: str = Field(default="")

    expires_at: Optional[datetime] = Field(default=None)
    is_pinned: bool = Field(default=False, index=True)

    author: Optional["User"] = Relationship()
    acknowledgments: list["MessageAcknowledgment"] = Relationship(
        back_populates="post",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class MessageAcknowledgment(TimestampMixin, table=True):
    __tablename__ = "message_acknowledgment"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_ack_post_user"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="message_board_post.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    acknowledged_at: datetime = Field(default_factory=utcnow)

    post: Optional[MessageBoardPost] = Relationship(back_populates="acknowledgments")

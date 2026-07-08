"""Notification model — lightweight in-app notifications.

Currently used for goal events: when a stylist sets/updates a goal, a
notification is created for their direct manager. Kept generic (``type`` +
``message`` + optional ``goal_id``) so other event types can reuse it.
"""

import enum
from typing import Optional

from sqlmodel import Field

from app.models.base import TimestampMixin


class NotificationType(enum.StrEnum):
    goal_set = "goal_set"
    goal_updated = "goal_updated"
    goal_reviewed = "goal_reviewed"


class Notification(TimestampMixin, table=True):
    __tablename__ = "notification"

    id: Optional[int] = Field(default=None, primary_key=True)
    # Who receives the notification.
    recipient_id: int = Field(foreign_key="users.id", index=True)
    # Who triggered it (e.g. the stylist who set the goal).
    actor_id: Optional[int] = Field(default=None, foreign_key="users.id")
    type: str = Field(default=NotificationType.goal_set, index=True)
    message: str = Field(default="")
    goal_id: Optional[int] = Field(default=None, foreign_key="goal.id")
    is_read: bool = Field(default=False, index=True)

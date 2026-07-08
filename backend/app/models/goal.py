"""Goal model — a stylist's self-set target for a pay period.

Business rules (see ``app.services.goal_service``):
* **One active goal per (stylist, week_start).** Setting a new goal deactivates
  the previous one (``is_active = False``) and links to it via
  ``previous_goal_id`` — the superseded rows *are* the goal history (no separate
  table needed). There are no drafts: saving is immediate + active.
* A manager reviews the active goal (approve / disapprove + comment); the status
  and comment are visible to the stylist.
"""

import enum
from datetime import date as date_type
from datetime import datetime
from typing import Optional

from sqlmodel import Field

from app.models.base import TimestampMixin, utcnow


class GoalApprovalStatus(enum.StrEnum):
    pending = "pending"
    approved = "approved"
    disapproved = "disapproved"


class Goal(TimestampMixin, table=True):
    __tablename__ = "goal"

    id: Optional[int] = Field(default=None, primary_key=True)
    stylist_id: int = Field(foreign_key="users.id", index=True)
    week_start: date_type = Field(index=True)

    # Targets captured from the Goal Planner when "Set Goal" is clicked.
    target_pph: float = Field(default=0.0)
    target_hours: float = Field(default=0.0)
    target_haircuts: int = Field(default=0)
    target_colors: int = Field(default=0)

    set_at: datetime = Field(default_factory=utcnow)
    is_active: bool = Field(default=True, index=True)
    # Links a new goal to the one it replaced (override history chain).
    previous_goal_id: Optional[int] = Field(default=None, foreign_key="goal.id")

    # Manager review.
    approval_status: str = Field(default=GoalApprovalStatus.pending, index=True)
    manager_comment: Optional[str] = Field(default=None)
    reviewed_by: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_at: Optional[datetime] = Field(default=None)

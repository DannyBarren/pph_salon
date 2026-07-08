"""Goal + notification request/response schemas."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.goal import GoalApprovalStatus


class GoalCreate(BaseModel):
    week_start: date
    target_pph: float = Field(ge=0)
    target_hours: float = Field(ge=0)
    target_haircuts: int = Field(ge=0)
    target_colors: int = Field(ge=0)
    # Admins/owners may set on behalf of a stylist; stylists omit (defaults to self).
    stylist_id: int | None = None


class GoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stylist_id: int
    week_start: date
    target_pph: float
    target_hours: float
    target_haircuts: int
    target_colors: int
    set_at: datetime
    is_active: bool
    previous_goal_id: int | None = None
    approval_status: str
    manager_comment: str | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None


class GoalReview(BaseModel):
    status: GoalApprovalStatus
    comment: str | None = None


class TeamGoalRow(BaseModel):
    stylist_id: int
    stylist_name: str
    active: GoalRead | None = None
    previous: GoalRead | None = None


class HierarchyStylist(BaseModel):
    stylist_id: int
    stylist_name: str
    active: GoalRead | None = None


class HierarchyManager(BaseModel):
    manager_id: int
    manager_name: str
    stylists: list[HierarchyStylist] = []


class HierarchySalon(BaseModel):
    salon_id: int
    salon_name: str
    managers: list[HierarchyManager] = []


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipient_id: int
    actor_id: int | None = None
    type: str
    message: str
    goal_id: int | None = None
    is_read: bool
    created_at: datetime

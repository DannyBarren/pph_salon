"""Audit log — an append-only trail of privileged (admin) actions.

Every mutating admin action (create salon, bulk-import users, change pay config,
assign managers, import weekly data) writes one row here. It intentionally stores
a denormalised snapshot (actor email/role, target, JSON detail) so the trail
survives even if the referenced rows are later edited or deleted.
"""

from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin


class AuditLog(TimestampMixin, table=True):
    __tablename__ = "audit_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    actor_email: Optional[str] = Field(default=None)
    actor_role: Optional[str] = Field(default=None)
    # e.g. "salon.create", "user.bulk_import", "payplan.config_update".
    action: str = Field(index=True)
    # The affected resource type + id, when applicable.
    target_type: Optional[str] = Field(default=None, index=True)
    target_id: Optional[str] = Field(default=None)
    salon_id: Optional[int] = Field(default=None, index=True)
    # Free-form structured context (counts, before/after, request id, ip).
    detail: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))

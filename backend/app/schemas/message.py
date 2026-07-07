"""Message board request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AckStats(BaseModel):
    acknowledged: int = 0
    total: int = 0
    percent: int = 0


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    # {"kind": "all"} | {"kind": "salons", "salonIds": [..]} | {"kind": "users", "userIds": [..]}
    target_audience: dict[str, Any] | None = None
    expires_at: datetime | None = None
    is_pinned: bool = False


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: int
    author_name: str | None = None
    author_role: str
    salon_id: int | None = None
    target_audience: dict[str, Any]
    title: str
    content: str
    created_at: datetime
    expires_at: datetime | None = None
    is_pinned: bool

    # Derived, per-viewer fields.
    stats: AckStats = AckStats()
    acknowledged_by_me: bool = False


class AckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    post_id: int
    user_id: int
    acknowledged_at: datetime


class AckDetail(AckRead):
    user_name: str | None = None


class PostAckDetail(BaseModel):
    stats: AckStats
    acknowledgments: list[AckDetail] = []
    pending_user_ids: list[int] = []

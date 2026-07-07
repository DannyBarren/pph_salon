"""User request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class UserBase(BaseModel):
    name: str
    role: UserRole
    salon_id: int
    manager_id: int | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    guarantee_rate: float | None = None


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    salon_id: int | None = None
    manager_id: int | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    guarantee_rate: float | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime

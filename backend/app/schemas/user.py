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
    # Not on the PPH pay plan (no personal pay/PPH dashboard; team views only).
    excluded: bool = False


class UserCreate(UserBase):
    # Optional initial password. When omitted, a strong random temporary
    # password is generated and (optionally) emailed to the user.
    password: str | None = None


class BulkUserRow(BaseModel):
    """One row of the CSV bulk-user import (email, name, role, salon_id, manager_id)."""

    email: str
    name: str
    role: UserRole = UserRole.stylist
    salon_id: int | None = None
    salon_name: str | None = None
    manager_id: int | None = None
    manager_email: str | None = None
    title: str | None = None
    phone: str | None = None
    guarantee_rate: float | None = None
    excluded: bool = False
    password: str | None = None


class BulkUserResult(BaseModel):
    """Summary returned by the bulk-user import endpoint."""

    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = []
    # Temporary passwords for freshly created users (email -> temp password),
    # returned once so the admin can distribute credentials. Empty when emailing.
    credentials: dict[str, str] = {}


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    salon_id: int | None = None
    manager_id: int | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    guarantee_rate: float | None = None
    excluded: bool | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ResetPasswordResponse(BaseModel):
    """Result of an admin/manager-initiated password reset."""

    user_id: int
    email: str | None = None
    emailed: bool = False
    # The new temporary password, returned once unless it was emailed instead.
    temporary_password: str | None = None


class InviteRequest(BaseModel):
    """Optional payload when unlocking an account: set/fix the email first."""

    email: str | None = None


class InviteResponse(BaseModel):
    """Result of unlocking (inviting) an account to set up its own password."""

    user_id: int
    email: str | None = None
    emailed: bool = False
    # The one-time setup link, returned so the admin can share it directly when
    # email delivery isn't configured. Null once emailing is confirmed.
    setup_link: str | None = None
    expires_at: datetime

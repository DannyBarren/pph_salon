"""User model (stylists, managers, admins) with a self-referential manager link."""

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.salon import Salon
    from app.models.week import Week


class UserRole(enum.StrEnum):
    stylist = "stylist"
    manager = "manager"
    admin = "admin"
    owner = "owner"


class User(TimestampMixin, table=True):
    # "user" is a reserved word in PostgreSQL, so the table is named "users".
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    role: UserRole = Field(index=True)
    title: Optional[str] = Field(default=None)

    # Auth fields. email is unique when set; hashed_password is null for seed
    # users that have not been invited to log in yet.
    email: Optional[str] = Field(default=None, unique=True, index=True)
    phone: Optional[str] = Field(default=None)
    hashed_password: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)

    # Account-setup / invite link. When an admin or manager "unlocks" an account
    # we store the SHA-256 of a one-time token (never the raw token) plus its
    # expiry; the user sets their own password via the emailed link, then it's
    # cleared. hashed_password stays null until they complete setup.
    setup_token_hash: Optional[str] = Field(default=None, index=True)
    setup_token_expires_at: Optional[datetime] = Field(default=None)

    # Optional 4–6 digit numeric passcode for fast, same-device re-entry. Stored
    # only as an argon2 hash (never plaintext, never logged). It is a convenience
    # gate on top of a full login — the user still authenticates fully (email +
    # password) at least once, and the app requires the passcode again at each
    # calendar-day boundary on the remembered device. ``passcode_failed_attempts``
    # supports a server-side lock so a lost device can't be brute-forced.
    passcode_hash: Optional[str] = Field(default=None)
    passcode_set_at: Optional[datetime] = Field(default=None)
    passcode_failed_attempts: int = Field(default=0, nullable=False)

    @property
    def has_password(self) -> bool:
        """Whether the account has completed setup (can log in with a password)."""
        return self.hashed_password is not None

    @property
    def has_passcode(self) -> bool:
        """Whether a fast-access numeric passcode is configured."""
        return self.passcode_hash is not None

    @property
    def status(self) -> str:
        """Lifecycle badge for admin UIs: pending_setup / active / deactivated."""
        if not self.is_active:
            return "deactivated"
        if self.hashed_password is None:
            return "pending_setup"
        return "active"

    # Per-stylist guaranteed $/hr floor (falls back to the salon/global rate).
    guarantee_rate: Optional[float] = Field(default=None)

    # "Excluded" employees are NOT on the PPH pay plan: they get no personal
    # pay/PPH dashboard and land on team/management views only. Typically
    # managers or SDL/Owner users who oversee a team without being paid on PPH.
    excluded: bool = Field(default=False, nullable=False)

    # External payroll/booking identifier (e.g. Zenoti/SSF "Employee code" like
    # ``VG1116``). Not globally unique — the same code can appear in more than one
    # salon — so imports resolve users by ``(salon_id, employee_code)``.
    employee_code: Optional[str] = Field(default=None, index=True)

    salon_id: int = Field(foreign_key="salon.id", index=True)
    # Self-referential: a stylist reports to a manager (also a User).
    manager_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)

    salon: Optional["Salon"] = Relationship(back_populates="users")
    manager: Optional["User"] = Relationship(
        back_populates="reports",
        sa_relationship_kwargs={"remote_side": "User.id"},
    )
    reports: list["User"] = Relationship(back_populates="manager")
    weeks: list["Week"] = Relationship(
        back_populates="stylist",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

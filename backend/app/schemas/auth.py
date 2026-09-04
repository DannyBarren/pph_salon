"""Auth request/response schemas."""


from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import UserRole


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    # Accepts an email OR a plain username (e.g. the admin's "Venita_Admin").
    # The login identifier is matched exactly against the user's `email` field,
    # which may hold either an email address or a username.
    email: str
    password: str


class RegisterRequest(BaseModel):
    """Invite-only: an admin creates a user with an initial password."""

    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.stylist
    salon_id: int
    manager_id: int | None = None
    title: str | None = None


class BootstrapRequest(BaseModel):
    """First-run: create the top-of-hierarchy owner + salon (token-gated).

    Only valid while the users table is empty and ``BOOTSTRAP_TOKEN`` is set.
    """

    token: str
    email: EmailStr
    password: str
    name: str
    salon_name: str = "Main Salon"


class ChangePasswordRequest(BaseModel):
    """Self-service password change (requires the current password)."""

    current_password: str
    new_password: str


class AcceptInviteRequest(BaseModel):
    """Complete account setup from an emailed link: set the first password."""

    token: str
    new_password: str


class SetPasscodeRequest(BaseModel):
    """Set or change the fast-access numeric passcode (authenticated).

    Re-authenticating with the current password is required so a walk-up on an
    unlocked session can't silently change the passcode.
    """

    passcode: str
    current_password: str


class VerifyPasscodeRequest(BaseModel):
    """Verify a passcode for a remembered device (authenticated, rate-limited)."""

    passcode: str


class PasscodeStatus(BaseModel):
    """Whether the signed-in user has a passcode configured."""

    has_passcode: bool


class InvitePreview(BaseModel):
    """Public, non-sensitive preview shown on the 'set your password' page."""

    name: str
    email: str | None = None
    valid: bool = True


class CurrentUser(BaseModel):
    """Public shape of the authenticated principal (also used in demo mode)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    role: UserRole
    salon_id: int
    manager_id: int | None = None
    # Personal guarantee floor ($/hr) — the stylist dashboard reads it directly
    # (falls back to the salon/global default when unset).
    guarantee_rate: float | None = None
    # Not on the PPH pay plan (no personal pay/PPH dashboard; team views only).
    excluded: bool = False
    # Whether a fast-access numeric passcode is configured (drives the daily
    # passcode gate on the frontend).
    has_passcode: bool = False
    is_demo: bool = False

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
    email: EmailStr
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


class CurrentUser(BaseModel):
    """Public shape of the authenticated principal (also used in demo mode)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    role: UserRole
    salon_id: int
    manager_id: int | None = None
    is_demo: bool = False

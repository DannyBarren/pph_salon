"""Authentication endpoints: invite-only register, login, refresh, me."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.api.deps import (
    assert_can_create_user,
    get_current_user,
    is_super_admin,
    require_manager_or_above,
)
from app.core import security
from app.core.config import Settings, get_settings
from app.core.limiter import limiter
from app.db.session import get_session
from app.models import Salon, User, UserRole
from app.schemas.auth import (
    AcceptInviteRequest,
    BootstrapRequest,
    ChangePasswordRequest,
    CurrentUser,
    InvitePreview,
    LoginRequest,
    PasscodeStatus,
    RefreshRequest,
    RegisterRequest,
    SetPasscodeRequest,
    Token,
    VerifyPasscodeRequest,
)
from app.schemas.user import UserRead
from app.services.audit import record_audit


def _find_by_setup_token(session: Session, token: str) -> User | None:
    """Resolve a live (unexpired) account-setup token to its user, or None."""
    if not token:
        return None
    user = session.exec(
        select(User).where(User.setup_token_hash == security.hash_token(token))
    ).first()
    if user is None or user.setup_token_expires_at is None:
        return None
    expires = user.setup_token_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        return None
    return user

router = APIRouter(prefix="/auth", tags=["auth"])

_LOGIN_LIMIT = get_settings().rate_limit_login


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    session: Session = Depends(get_session),
    creator: User = Depends(require_manager_or_above),
) -> User:
    """Invite-only, hierarchical: create a subordinate account with a password.

    Self-registration is disabled. A creator may only invite roles below their
    own; managers are confined to stylists in their own salon (auto-assigned as
    the report's manager). Prefer ``POST /users`` for admin-generated passwords.
    """
    existing = session.exec(select(User).where(User.email == body.email)).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    try:
        security.validate_password(body.password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    salon_id = body.salon_id if is_super_admin(creator) else creator.salon_id
    manager_id = body.manager_id if is_super_admin(creator) else creator.id
    assert_can_create_user(creator, body.role, salon_id)

    user = User(
        name=body.name,
        email=body.email,
        role=body.role,
        salon_id=salon_id,
        manager_id=manager_id,
        title=body.title,
        hashed_password=security.hash_password(body.password),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/bootstrap", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit(_LOGIN_LIMIT)
def bootstrap(
    request: Request,
    body: BootstrapRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Token:
    """Create the first owner (top of the hierarchy) — token-gated, one-time.

    Guards:
    * ``BOOTSTRAP_TOKEN`` must be configured (else the endpoint is disabled), and
      the provided token must match (constant-time compare).
    * Only succeeds while **no users exist** — prevents re-use as a backdoor.

    Returns a JWT pair so the new owner is immediately signed in.
    """
    if not settings.bootstrap_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bootstrap is disabled")
    provided = body.token or request.headers.get("X-Bootstrap-Token") or ""
    if not secrets.compare_digest(provided, settings.bootstrap_token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid bootstrap token")
    if session.exec(select(User)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Application is already initialised")
    try:
        security.validate_password(body.password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    salon = session.exec(select(Salon).where(Salon.name == body.salon_name)).first()
    if salon is None:
        salon = Salon(name=body.salon_name)
        session.add(salon)
        session.commit()
        session.refresh(salon)

    owner = User(
        name=body.name,
        email=body.email,
        role=UserRole.owner,
        salon_id=salon.id,
        hashed_password=security.hash_password(body.password),
        is_active=True,
    )
    session.add(owner)
    session.commit()
    session.refresh(owner)
    record_audit(session, actor=owner, action="auth.bootstrap", target_type="user",
                 target_id=owner.id, salon_id=salon.id, detail={"email": owner.email})
    return Token(
        access_token=security.create_access_token(owner.id, role=str(owner.role)),
        refresh_token=security.create_refresh_token(owner.id),
    )


@router.post("/login", response_model=Token)
@limiter.limit(_LOGIN_LIMIT)
def login(
    request: Request,
    body: LoginRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Token:
    """Rate-limited email/password login → JWT access + refresh pair."""
    user = session.exec(select(User).where(User.email == body.email)).first()
    if (
        user is None
        or not user.is_active
        or user.hashed_password is None
        or not security.verify_password(body.password, user.hashed_password)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    # Optional email-verification gate (stub): requires a verified flag when on.
    return Token(
        access_token=security.create_access_token(user.id, role=str(user.role)),
        refresh_token=security.create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=Token)
def refresh(
    body: RefreshRequest,
    session: Session = Depends(get_session),
) -> Token:
    try:
        payload = security.decode_token(body.refresh_token, expected_type="refresh")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc

    sub = payload.get("sub")
    user = session.get(User, int(sub)) if sub is not None else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return Token(
        access_token=security.create_access_token(user.id, role=str(user.role)),
        refresh_token=security.create_refresh_token(user.id),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> None:
    """Self-service password change for the signed-in user.

    Requires the current password. Not available to the synthetic demo principal.
    Users should do this on first login after receiving a temporary password.
    """
    if settings.demo_mode or not user.id or user.hashed_password is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Password change requires a real signed-in account",
        )
    if not security.verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    try:
        security.validate_password(body.new_password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    user.hashed_password = security.hash_password(body.new_password)
    session.add(user)
    session.commit()


@router.get("/invite/{token}", response_model=InvitePreview)
def preview_invite(token: str, session: Session = Depends(get_session)) -> InvitePreview:
    """Public: validate a setup link and return whom it's for (for the UI).

    Never leaks details for an invalid/expired token — returns ``valid: false``.
    """
    user = _find_by_setup_token(session, token)
    if user is None:
        return InvitePreview(name="", email=None, valid=False)
    return InvitePreview(name=user.name, email=user.email, valid=True)


@router.post("/accept-invite", response_model=Token)
@limiter.limit(_LOGIN_LIMIT)
def accept_invite(
    request: Request,
    body: AcceptInviteRequest,
    session: Session = Depends(get_session),
) -> Token:
    """Public: complete account setup from an emailed link by choosing a password.

    Validates the one-time token, sets the password, activates the account, and
    invalidates the token. Returns a JWT pair so the user is signed straight in.
    Afterward they log in with their email + this password.
    """
    user = _find_by_setup_token(session, body.token)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This setup link is invalid or has expired")
    try:
        security.validate_password(body.new_password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    user.hashed_password = security.hash_password(body.new_password)
    user.is_active = True
    user.setup_token_hash = None
    user.setup_token_expires_at = None
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit(session, actor=user, action="auth.accept_invite", target_type="user",
                 target_id=user.id, salon_id=user.salon_id, detail={"email": user.email})
    return Token(
        access_token=security.create_access_token(user.id, role=str(user.role)),
        refresh_token=security.create_refresh_token(user.id),
    )


@router.post("/passcode", response_model=PasscodeStatus)
def set_passcode(
    body: SetPasscodeRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PasscodeStatus:
    """Set or change the fast-access numeric passcode for the signed-in user.

    Requires the current password (re-auth). The passcode is stored only as an
    argon2 hash and never logged. Not available to the synthetic demo principal.
    """
    if settings.demo_mode or not user.id or user.hashed_password is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Setting a passcode requires a real signed-in account",
        )
    if not security.verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    try:
        security.validate_passcode(body.passcode)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    user.passcode_hash = security.hash_passcode(body.passcode)
    user.passcode_set_at = datetime.now(UTC)
    user.passcode_failed_attempts = 0
    session.add(user)
    session.commit()
    record_audit(session, actor=user, action="auth.passcode_set", target_type="user",
                 target_id=user.id, salon_id=user.salon_id, detail={})
    return PasscodeStatus(has_passcode=True)


@router.delete("/passcode", response_model=PasscodeStatus)
def clear_passcode(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PasscodeStatus:
    """Disable the fast-access passcode for the signed-in user."""
    if settings.demo_mode or not user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Managing a passcode requires a real signed-in account",
        )
    user.passcode_hash = None
    user.passcode_set_at = None
    user.passcode_failed_attempts = 0
    session.add(user)
    session.commit()
    record_audit(session, actor=user, action="auth.passcode_clear", target_type="user",
                 target_id=user.id, salon_id=user.salon_id, detail={})
    return PasscodeStatus(has_passcode=False)


@router.post("/passcode/verify", response_model=Token)
@limiter.limit(_LOGIN_LIMIT)
def verify_passcode(
    request: Request,
    body: VerifyPasscodeRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Token:
    """Verify the passcode for a remembered device and issue a fresh token pair.

    Rate-limited and lockout-protected: after too many consecutive failures the
    passcode is disabled and the user must fall back to a full password login.
    Returns a new JWT pair so the caller can extend the remembered session.
    """
    if settings.demo_mode or not user.id or user.passcode_hash is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No passcode is set for this account")
    if user.passcode_failed_attempts >= security.PASSCODE_MAX_ATTEMPTS:
        # Lock the passcode; force a full login to re-establish trust.
        user.passcode_hash = None
        user.passcode_set_at = None
        session.add(user)
        session.commit()
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many incorrect attempts. Sign in with your password.",
        )
    if not security.verify_passcode(body.passcode, user.passcode_hash):
        user.passcode_failed_attempts += 1
        session.add(user)
        session.commit()
        remaining = max(0, security.PASSCODE_MAX_ATTEMPTS - user.passcode_failed_attempts)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Incorrect passcode. {remaining} attempt(s) left before password sign-in is required.",
        )
    user.passcode_failed_attempts = 0
    session.add(user)
    session.commit()
    return Token(
        access_token=security.create_access_token(user.id, role=str(user.role)),
        refresh_token=security.create_refresh_token(user.id),
    )


@router.get("/me", response_model=CurrentUser)
def me(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    """Current principal. In demo mode this returns the injected admin."""
    return CurrentUser(
        id=user.id or 0,
        name=user.name,
        email=user.email,
        role=user.role,
        salon_id=user.salon_id,
        manager_id=user.manager_id,
        guarantee_rate=getattr(user, "guarantee_rate", None),
        excluded=bool(getattr(user, "excluded", False)),
        has_passcode=bool(getattr(user, "passcode_hash", None)),
        is_demo=settings.demo_mode,
    )

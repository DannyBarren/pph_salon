"""Authentication endpoints: invite-only register, login, refresh, me."""

from __future__ import annotations

import secrets

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
    BootstrapRequest,
    CurrentUser,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    Token,
)
from app.schemas.user import UserRead
from app.services.audit import record_audit

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
        is_demo=settings.demo_mode,
    )

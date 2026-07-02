"""Authentication endpoints: invite-only register, login, refresh, me."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_role
from app.core import security
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models import User
from app.schemas.auth import (
    CurrentUser,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    Token,
)
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    session: Session = Depends(get_session),
    _admin: User = Depends(require_role(["admin"])),
) -> User:
    """Invite-only: an admin creates a user with an initial password."""
    existing = session.exec(select(User).where(User.email == body.email)).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        name=body.name,
        email=body.email,
        role=body.role,
        salon_id=body.salon_id,
        manager_id=body.manager_id,
        title=body.title,
        hashed_password=security.hash_password(body.password),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(body: LoginRequest, session: Session = Depends(get_session)) -> Token:
    user = session.exec(select(User).where(User.email == body.email)).first()
    if (
        user is None
        or not user.is_active
        or user.hashed_password is None
        or not security.verify_password(body.password, user.hashed_password)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
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

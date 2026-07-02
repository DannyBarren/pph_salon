"""Password hashing and JWT helpers.

Uses argon2 (via passlib) for password hashing and PyJWT for tokens. Keeping all
crypto in one module makes it easy to audit and swap implementations.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def _create_token(subject: str | int, token_type: TokenType, expires: timedelta, **claims: Any) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        **claims,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str | int, **claims: Any) -> str:
    settings = get_settings()
    return _create_token(
        subject, "access", timedelta(minutes=settings.access_token_expire_minutes), **claims
    )


def create_refresh_token(subject: str | int, **claims: Any) -> str:
    settings = get_settings()
    return _create_token(
        subject, "refresh", timedelta(days=settings.refresh_token_expire_days), **claims
    )


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    """Decode & validate a JWT. Raises ``jwt.InvalidTokenError`` on failure."""
    settings = get_settings()
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    if expected_type is not None and payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"Expected {expected_type} token")
    return payload

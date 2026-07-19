"""Password hashing and JWT helpers.

Uses argon2 (via passlib) for password hashing and PyJWT for tokens. Keeping all
crypto in one module makes it easy to audit and swap implementations.
"""

from __future__ import annotations

import hashlib
import secrets
import string
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


def validate_password(password: str) -> None:
    """Enforce the minimum password policy. Raises ``ValueError`` on failure."""
    settings = get_settings()
    if len(password) < settings.min_password_length:
        raise ValueError(
            f"Password must be at least {settings.min_password_length} characters"
        )


def generate_setup_token() -> str:
    """A high-entropy, URL-safe one-time token for account-setup / invite links.

    The raw token is emailed to the user and never stored; only its
    :func:`hash_token` digest is persisted, so a DB leak can't be replayed.
    """
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Stable SHA-256 hex digest used to store/look up setup tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(raw_token: str, stored_hash: str | None) -> bool:
    """Constant-time comparison of a presented token against a stored hash."""
    if not stored_hash:
        return False
    return secrets.compare_digest(hash_token(raw_token), stored_hash)


def generate_temp_password(length: int = 14) -> str:
    """Cryptographically-strong temporary password for provisioned users."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_"
    # Guarantee at least one of each class for downstream policy checks.
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
        ):
            return pwd


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

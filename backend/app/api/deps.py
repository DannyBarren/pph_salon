"""Shared API dependencies: authentication, RBAC, and visibility scoping.

Demo mode (``settings.demo_mode``) is the key switch: when on, every protected
route works with NO credentials because :func:`get_current_user` injects an
admin-level user. Turn it off (``DEMO_MODE=false``) to enforce real JWT + roles.
"""

from __future__ import annotations

from collections.abc import Sequence

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core import security
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models import User, UserRole

# auto_error=False so demo mode works even with no Authorization header.
_bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _demo_admin(settings: Settings) -> User:
    """A synthetic, non-persisted admin principal used in demo mode."""
    return User(
        id=0,
        name=settings.demo_user_name,
        email=settings.demo_user_email,
        role=UserRole.admin,
        salon_id=0,
        is_active=True,
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    x_demo_user_id: int | None = Header(default=None, alias="X-Demo-User-Id"),
) -> User:
    """Resolve the current principal.

    * **Demo mode:** returns a synthetic admin so all routes work with no login.
      Optionally pass ``X-Demo-User-Id`` to *act as* a real user (e.g. a manager)
      to exercise role-scoped behavior without credentials.
    * **Real mode:** validates the Bearer access token and loads the user.
    """
    if settings.demo_mode:
        if x_demo_user_id is not None:
            user = session.get(User, x_demo_user_id)
            if user is not None:
                return user
        return _demo_admin(settings)

    if creds is None:
        raise _UNAUTHENTICATED
    try:
        payload = security.decode_token(creds.credentials, expected_type="access")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    sub = payload.get("sub")
    user = session.get(User, int(sub)) if sub is not None else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require_role(roles: Sequence[str]):
    """Dependency factory enforcing that the user has one of ``roles``.

    Admins always pass (full access). Works transparently in demo mode since the
    injected principal is an admin.
    """
    allowed = {str(r) for r in roles}

    def dependency(user: User = Depends(get_current_user)) -> User:
        # Admins and owners always pass (full access).
        if user.role in (UserRole.admin, UserRole.owner):
            return user
        if str(user.role) not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return dependency


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Only ``admin`` / ``owner`` (the super-admin personas) may pass.

    Used to gate destructive / org-wide operations: creating salons, bulk user
    import, pay-plan configuration, and audit-log access.
    """
    if user.role not in (UserRole.admin, UserRole.owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super-admin privileges required")
    return user


def assert_salon_access(user: User, salon_id: int | None) -> None:
    """Row-level salon scoping guard.

    admin / owner may touch any salon. Everyone else is confined to their own
    ``salon_id``. Raises 403 on a cross-salon attempt.
    """
    if user.role in (UserRole.admin, UserRole.owner):
        return
    if salon_id is not None and salon_id != user.salon_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cross-salon access denied")


def visible_stylist_ids(user: User, session: Session) -> list[int]:
    """IDs of stylists the ``user`` may see.

    admin / owner → all stylists · manager → everyone in their salon ·
    stylist → themselves.
    """
    if user.role in (UserRole.admin, UserRole.owner):
        rows = session.exec(select(User.id).where(User.role == UserRole.stylist)).all()
        return list(rows)
    if user.role == UserRole.manager:
        rows = session.exec(
            select(User.id).where(
                User.salon_id == user.salon_id, User.role == UserRole.stylist
            )
        ).all()
        return list(rows)
    return [user.id] if user.id else []

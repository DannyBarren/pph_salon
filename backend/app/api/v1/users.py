"""User endpoints demonstrating role-scoped visibility."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.deps import get_current_user, visible_stylist_ids
from app.db.session import get_session
from app.models import User
from app.schemas.user import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/visible-stylists", response_model=list[UserRead])
def list_visible_stylists(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[User]:
    """Stylists the caller may see.

    admin → all · manager → direct reports · stylist → self. In demo mode the
    caller is admin (all), unless you pass ``X-Demo-User-Id`` to act as someone.
    """
    ids = visible_stylist_ids(current, session)
    if not ids:
        return []
    return list(session.exec(select(User).where(User.id.in_(ids))).all())

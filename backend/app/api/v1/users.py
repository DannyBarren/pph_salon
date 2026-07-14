"""User endpoints: role-scoped visibility + super-admin user management.

Read access is role-scoped (stylist → self, manager → salon, admin/owner → all).
Create / update / role & manager assignment / deactivation are super-admin only
and audit-logged. Single-user creation here complements the CSV bulk import in
``admin.py``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import (
    get_current_user,
    require_super_admin,
    visible_stylist_ids,
)
from app.core import security
from app.db.session import get_session
from app.models import Salon, User, UserRole
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.audit import record_audit
from app.services.notifications_out import send_welcome_email

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/visible-stylists", response_model=list[UserRead])
def list_visible_stylists(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[User]:
    """Stylists the caller may see.

    admin/owner → all · manager → salon · stylist → self. In demo mode the
    caller is admin (all), unless you pass ``X-Demo-User-Id`` to act as someone.
    """
    ids = visible_stylist_ids(current, session)
    if not ids:
        return []
    return list(session.exec(select(User).where(User.id.in_(ids))).all())


@router.get("", response_model=list[UserRead])
def list_users(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    salon_id: int | None = None,
    role: UserRole | None = None,
) -> list[User]:
    """List users, scoped to the caller's salon unless they are super-admin."""
    stmt = select(User)
    if current.role not in (UserRole.admin, UserRole.owner):
        stmt = stmt.where(User.salon_id == current.salon_id)
    elif salon_id is not None:
        stmt = stmt.where(User.salon_id == salon_id)
    if role is not None:
        stmt = stmt.where(User.role == role)
    return list(session.exec(stmt.order_by(User.name)).all())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> User:
    """Create a single user (super-admin). Generates a temp password if omitted."""
    if body.email:
        existing = session.exec(select(User).where(User.email == body.email)).first()
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    salon = session.get(Salon, body.salon_id)
    if salon is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown salon_id {body.salon_id}")

    password = body.password or security.generate_temp_password()
    try:
        security.validate_password(password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    user = User(
        name=body.name,
        role=body.role,
        salon_id=body.salon_id,
        manager_id=body.manager_id,
        title=body.title,
        email=body.email,
        phone=body.phone,
        guarantee_rate=body.guarantee_rate,
        hashed_password=security.hash_password(password),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    if user.email:
        send_welcome_email(user.email, user.name,
                           temp_password=None if body.password else password)
    record_audit(session, actor=admin, action="user.create", target_type="user",
                 target_id=user.id, salon_id=user.salon_id,
                 detail={"role": str(user.role), "email": user.email})
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    body: UserUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> User:
    """Update a user, including role and manager assignment (super-admin)."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    updates = body.model_dump(exclude_none=True)
    if "salon_id" in updates and session.get(Salon, updates["salon_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown salon_id")
    if "manager_id" in updates:
        mgr = session.get(User, updates["manager_id"])
        if mgr is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown manager_id")
    for key, value in updates.items():
        setattr(user, key, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit(session, actor=admin, action="user.update", target_type="user",
                 target_id=user.id, salon_id=user.salon_id,
                 detail={"fields": list(updates)})
    return user


@router.post("/{user_id}/deactivate", response_model=UserRead)
def deactivate_user(
    user_id: int,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_active = False
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit(session, actor=admin, action="user.deactivate", target_type="user",
                 target_id=user.id, salon_id=user.salon_id, detail={})
    return user

"""User endpoints: role-scoped visibility + super-admin user management.

Read access is role-scoped (stylist → self, manager → salon, admin/owner → all).
Create / update / role & manager assignment / deactivation are super-admin only
and audit-logged. Single-user creation here complements the CSV bulk import in
``admin.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import (
    assert_can_create_user,
    assert_can_manage_user,
    get_current_user,
    is_super_admin,
    require_manager_or_above,
    visible_stylist_ids,
)
from app.core import security
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models import Salon, User, UserRole
from app.schemas.user import (
    InviteRequest,
    InviteResponse,
    ResetPasswordResponse,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.services.audit import record_audit
from app.services.notifications_out import send_invite_email, send_welcome_email

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
    creator: User = Depends(require_manager_or_above),
) -> User:
    """Provision a subordinate account (delegated, hierarchical).

    * **Super-admins** (owner/admin) can create any role below their own in any
      salon and assign any manager.
    * **Managers** can create **stylists in their own salon**; the new stylist is
      automatically assigned to report to the manager who created them.
    """
    if body.email:
        existing = session.exec(select(User).where(User.email == body.email)).first()
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Managers are confined to their salon and become the report's manager.
    salon_id = body.salon_id if is_super_admin(creator) else creator.salon_id
    manager_id = body.manager_id if is_super_admin(creator) else creator.id

    assert_can_create_user(creator, body.role, salon_id)

    salon = session.get(Salon, salon_id)
    if salon is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown salon_id {salon_id}")
    if manager_id is not None and session.get(User, manager_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown manager_id")

    password = body.password or security.generate_temp_password()
    try:
        security.validate_password(password)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    user = User(
        name=body.name,
        role=body.role,
        salon_id=salon_id,
        manager_id=manager_id,
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
    record_audit(session, actor=creator, action="user.create", target_type="user",
                 target_id=user.id, salon_id=user.salon_id,
                 detail={"role": str(user.role), "email": user.email,
                         "manager_id": user.manager_id})
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    body: UserUpdate,
    session: Session = Depends(get_session),
    actor: User = Depends(require_manager_or_above),
) -> User:
    """Update a subordinate account (role/manager/details).

    Super-admins may update anyone; managers may update only subordinate accounts
    in their own salon and cannot elevate a user to/above their own rank or move
    them to another salon.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    assert_can_manage_user(actor, user)

    updates = body.model_dump(exclude_none=True)
    if not is_super_admin(actor):
        # Managers can't reassign salons or promote to/above their own rank.
        updates.pop("salon_id", None)
        if "role" in updates:
            assert_can_create_user(actor, updates["role"], user.salon_id)
    if "salon_id" in updates and session.get(Salon, updates["salon_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown salon_id")
    if "manager_id" in updates and updates["manager_id"] is not None:
        if session.get(User, updates["manager_id"]) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown manager_id")
    for key, value in updates.items():
        setattr(user, key, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit(session, actor=actor, action="user.update", target_type="user",
                 target_id=user.id, salon_id=user.salon_id,
                 detail={"fields": list(updates)})
    return user


@router.post("/{user_id}/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    user_id: int,
    email_credentials: bool = False,
    session: Session = Depends(get_session),
    actor: User = Depends(require_manager_or_above),
) -> ResetPasswordResponse:
    """Reset a subordinate's password to a new temporary value.

    Super-admins may reset anyone; managers may reset only their own-salon
    subordinates. The temp password is returned once (or emailed when
    ``email_credentials=true`` and the user has an email + SendGrid is set).
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    assert_can_manage_user(actor, user)

    temp = security.generate_temp_password()
    user.hashed_password = security.hash_password(temp)
    session.add(user)
    session.commit()

    emailed = False
    if email_credentials and user.email:
        emailed = send_welcome_email(user.email, user.name, temp_password=temp).delivered
    record_audit(session, actor=actor, action="user.reset_password", target_type="user",
                 target_id=user.id, salon_id=user.salon_id, detail={"emailed": emailed})
    return ResetPasswordResponse(
        user_id=user.id,
        email=user.email,
        emailed=emailed,
        temporary_password=None if emailed else temp,
    )


@router.post("/{user_id}/invite", response_model=InviteResponse)
def invite_user(
    user_id: int,
    body: InviteRequest | None = None,
    session: Session = Depends(get_session),
    actor: User = Depends(require_manager_or_above),
    settings: Settings = Depends(get_settings),
) -> InviteResponse:
    """Unlock an account so its owner can set their own password via an emailed
    link ("send setup link").

    Delegated + hierarchical: super-admins may unlock anyone; a manager may only
    unlock subordinate accounts in their own salon (their stylists). The account
    must have an email (supply one in the body to set it now if missing). A
    one-time, expiring token is generated — only its hash is stored — and the
    link is emailed (returned directly when email delivery isn't configured so it
    can be shared manually). This does NOT set a password; the user chooses it.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    assert_can_manage_user(actor, user)

    # Set/fix the email (their future username) if provided.
    if body and body.email:
        new_email = body.email.strip()
        clash = session.exec(
            select(User).where(User.email == new_email, User.id != user.id)
        ).first()
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
        user.email = new_email
    if not user.email:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This account has no email. Provide one to send the setup link.",
        )

    raw_token = security.generate_setup_token()
    expires_at = datetime.now(UTC) + timedelta(hours=settings.invite_token_expire_hours)
    user.setup_token_hash = security.hash_token(raw_token)
    user.setup_token_expires_at = expires_at
    user.is_active = True  # unlock (reactivate if previously disabled)
    session.add(user)
    session.commit()

    setup_link = f"{settings.app_base_url.rstrip('/')}/accept-invite?token={raw_token}"
    delivery = send_invite_email(user.email, user.name, setup_link)
    record_audit(session, actor=actor, action="user.invite", target_type="user",
                 target_id=user.id, salon_id=user.salon_id,
                 detail={"emailed": delivery.delivered})
    return InviteResponse(
        user_id=user.id,
        email=user.email,
        emailed=delivery.delivered,
        # Only withhold the link when we're confident it was delivered by email.
        setup_link=None if delivery.delivered else setup_link,
        expires_at=expires_at,
    )


@router.post("/{user_id}/deactivate", response_model=UserRead)
def deactivate_user(
    user_id: int,
    session: Session = Depends(get_session),
    actor: User = Depends(require_manager_or_above),
) -> User:
    """Deactivate a subordinate account (super-admin anywhere; manager in-salon)."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    assert_can_manage_user(actor, user)
    user.is_active = False
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit(session, actor=actor, action="user.deactivate", target_type="user",
                 target_id=user.id, salon_id=user.salon_id, detail={})
    return user

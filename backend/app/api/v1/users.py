"""User endpoints: reporting-tree visibility + super-admin user management.

Read access follows the locked PPH visibility rules (admin → everyone incl.
off-PPH/orphans; owner/manager → on-PPH members of their ``manager_id`` tree;
stylist → self). Create / update / deactivation stay delegated + audit-logged,
but turning PPH on/off (``excluded``) and assigning ``manager_id`` are
**Admin-only**. Single-user creation here complements the CSV bulk import in
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
    is_admin,
    is_super_admin,
    require_manager_or_above,
    visible_stylist_ids,
    visible_user_ids,
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
from app.services.employee_codes import find_user_by_employee_code, normalize_employee_code
from app.services.notifications_out import send_invite_email, send_welcome_email


def _require_unique_employee_code(
    session: Session,
    raw: object | None,
    role: UserRole,
    *,
    salon_id: int,
    exclude_id: int | None = None,
) -> str | None:
    """Normalize and enforce required + unique-per-salon employee codes."""
    code = normalize_employee_code(raw)
    if role in (UserRole.stylist, UserRole.manager) and not code:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Employee code is required for stylists and managers",
        )
    if not code:
        return None
    clash = find_user_by_employee_code(
        session, code, exclude_id=exclude_id, salon_id=salon_id
    )
    if clash is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Employee code '{code}' is already in use at this salon",
        )
    return code

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/visible-stylists", response_model=list[UserRead])
def list_visible_stylists(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[User]:
    """Stylists the caller may see (locked PPH visibility rules).

    admin → all (incl. off-PPH + orphans) · owner/manager → on-PPH stylists in
    their reporting tree · stylist → self. In demo mode the caller is admin
    (all), unless you pass ``X-Demo-User-Id`` to act as someone.
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
    """List the accounts the caller may see (locked PPH visibility rules).

    Admin → every account (incl. off-PPH and orphans), optionally filtered by
    salon/role. Owner/manager → on-PPH members of their reporting tree only.
    Stylist → themselves.
    """
    ids = visible_user_ids(current, session)
    if not ids:
        return []
    stmt = select(User).where(User.id.in_(ids))
    if salon_id is not None:
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

    employee_code = _require_unique_employee_code(
        session, body.employee_code, body.role, salon_id=salon_id
    )

    hashed_password = None
    if body.password:
        try:
            security.validate_password(body.password)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        hashed_password = security.hash_password(body.password)

    user = User(
        name=body.name,
        role=body.role,
        salon_id=salon_id,
        manager_id=manager_id,
        title=body.title,
        email=body.email,
        phone=body.phone,
        guarantee_rate=body.guarantee_rate,
        excluded=body.excluded,
        employee_code=employee_code,
        hashed_password=hashed_password,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    if user.email and body.password:
        send_welcome_email(user.email, user.name, temp_password=None)
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
    if not is_admin(actor):
        # Only Admin may turn PPH on/off or place someone under a manager.
        # (No-op payloads that restate the current value are allowed through so
        # shared edit forms don't break.)
        if "excluded" in updates and updates["excluded"] != user.excluded:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Only Admin can turn the PPH plan on or off",
            )
        if "manager_id" in updates and updates["manager_id"] != user.manager_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Only Admin can assign or change a user's manager",
            )
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
    if "employee_code" in updates or "role" in updates or "salon_id" in updates:
        next_role = updates.get("role", user.role)
        raw_code = updates.get("employee_code", user.employee_code)
        dest_salon = updates.get("salon_id", user.salon_id)
        updates["employee_code"] = _require_unique_employee_code(
            session,
            raw_code,
            next_role,
            salon_id=dest_salon,
            exclude_id=user.id,
        )
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

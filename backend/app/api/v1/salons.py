"""Salon management + pay-plan configuration (super-admin).

A super-admin (``admin`` / ``owner``) can create salons, edit per-salon config
(guarantee rate, service prices), and manage the PPH pay-tier ladder that the
pay engine reads. All mutations are audit-logged and salon-scoped.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import assert_salon_access, get_current_user, require_super_admin
from app.db.session import get_session
from app.models import PayTier, Salon, User
from app.schemas.pay_tier import PayTierCreate, PayTierRead, PayTierUpdate
from app.schemas.salon import SalonCreate, SalonRead, SalonUpdate
from app.services.audit import record_audit

router = APIRouter(prefix="/salons", tags=["salons"])


@router.get("", response_model=list[SalonRead])
def list_salons(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Salon]:
    """List salons visible to the caller (all for super-admins; own otherwise)."""
    stmt = select(Salon).order_by(Salon.name)
    salons = list(session.exec(stmt).all())
    from app.models import UserRole

    if current.role in (UserRole.admin, UserRole.owner):
        return salons
    return [s for s in salons if s.id == current.salon_id]


@router.post("", response_model=SalonRead, status_code=status.HTTP_201_CREATED)
def create_salon(
    body: SalonCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> Salon:
    existing = session.exec(select(Salon).where(Salon.name == body.name)).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A salon with that name already exists")
    data = body.model_dump(exclude_none=True)
    salon = Salon(**data)
    session.add(salon)
    session.commit()
    session.refresh(salon)
    record_audit(session, actor=admin, action="salon.create", target_type="salon",
                 target_id=salon.id, salon_id=salon.id, detail={"name": salon.name})
    return salon


@router.get("/{salon_id}", response_model=SalonRead)
def get_salon(
    salon_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Salon:
    assert_salon_access(current, salon_id)
    salon = session.get(Salon, salon_id)
    if salon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Salon not found")
    return salon


@router.patch("/{salon_id}", response_model=SalonRead)
def update_salon(
    salon_id: int,
    body: SalonUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> Salon:
    salon = session.get(Salon, salon_id)
    if salon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Salon not found")
    updates = body.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(salon, key, value)
    session.add(salon)
    session.commit()
    session.refresh(salon)
    record_audit(session, actor=admin, action="salon.update", target_type="salon",
                 target_id=salon.id, salon_id=salon.id, detail={"fields": list(updates)})
    return salon


# ── Pay-plan tier ladder ────────────────────────────────────────────────────

@router.get("/{salon_id}/pay-tiers", response_model=list[PayTierRead])
def list_pay_tiers(
    salon_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PayTier]:
    assert_salon_access(current, salon_id)
    stmt = select(PayTier).where(PayTier.salon_id == salon_id).order_by(PayTier.desired_rate)
    return list(session.exec(stmt).all())


@router.put("/{salon_id}/pay-tiers", response_model=list[PayTierRead])
def replace_pay_tiers(
    salon_id: int,
    tiers: list[PayTierCreate],
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> list[PayTier]:
    """Replace the salon's entire pay-tier ladder in one idempotent call."""
    salon = session.get(Salon, salon_id)
    if salon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Salon not found")
    for existing in session.exec(select(PayTier).where(PayTier.salon_id == salon_id)).all():
        session.delete(existing)
    session.flush()
    created: list[PayTier] = []
    seen: set[float] = set()
    for t in tiers:
        if t.desired_rate in seen:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"Duplicate desired_rate {t.desired_rate}")
        seen.add(t.desired_rate)
        row = PayTier(salon_id=salon_id, desired_rate=t.desired_rate, pph=t.pph)
        session.add(row)
        created.append(row)
    session.commit()
    for row in created:
        session.refresh(row)
    record_audit(session, actor=admin, action="payplan.config_update", target_type="salon",
                 target_id=salon_id, salon_id=salon_id, detail={"tier_count": len(created)})
    return sorted(created, key=lambda r: r.desired_rate)


@router.patch("/{salon_id}/pay-tiers/{tier_id}", response_model=PayTierRead)
def update_pay_tier(
    salon_id: int,
    tier_id: int,
    body: PayTierUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> PayTier:
    tier = session.get(PayTier, tier_id)
    if tier is None or tier.salon_id != salon_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pay tier not found")
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(tier, key, value)
    session.add(tier)
    session.commit()
    session.refresh(tier)
    record_audit(session, actor=admin, action="payplan.tier_update", target_type="pay_tier",
                 target_id=tier_id, salon_id=salon_id, detail={})
    return tier

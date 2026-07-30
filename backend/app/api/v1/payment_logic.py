"""Global payment-logic endpoints (highest-admin only).

These control the single organisation-wide configuration that drives every
calculation shown to every user across every location:

* ``GET  /payment-logic``          — current global logic + formula breakdown
* ``PUT  /payment-logic``          — replace the global logic (validated + audited)
* ``POST /payment-logic/preview``  — evaluate proposed logic on sample/real data

There are no per-salon or per-user variants: payment logic is global only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import require_highest_admin
from app.db.session import get_session
from app.models import User
from app.schemas.payment_logic import (
    PaymentLogicPreviewRequest,
    PaymentLogicPreviewResponse,
    PaymentLogicRead,
    PaymentLogicUpdate,
)
from app.services import payment_logic as pl
from app.services.audit import record_audit

router = APIRouter(prefix="/payment-logic", tags=["payment-logic"])


def _to_read(config, *, include_formula: bool = True) -> PaymentLogicRead:
    read = PaymentLogicRead.model_validate(config)
    if include_formula:
        read.formula = pl.formula_breakdown(config)
    return read


@router.get("", response_model=PaymentLogicRead)
def get_payment_logic(
    session: Session = Depends(get_session),
    _: User = Depends(require_highest_admin),
) -> PaymentLogicRead:
    """Return the current global payment logic and a plain-language breakdown."""
    config = pl.get_or_create_config(session)
    return _to_read(config)


@router.put("", response_model=PaymentLogicRead)
def update_payment_logic(
    body: PaymentLogicUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_highest_admin),
) -> PaymentLogicRead:
    """Replace the global payment logic. Applies to the entire population.

    Validated by the schema (unique, monotonic tiers; sane rate bounds) and
    written to the audit trail with a before/after snapshot.
    """
    config = pl.get_or_create_config(session)

    before = {
        "tiers": config.tiers,
        "np_rate": config.np_rate,
        "guarantee_rate": config.guarantee_rate,
        "commission_rate": config.commission_rate,
        "haircut_price": config.haircut_price,
        "color_price": config.color_price,
    }

    config.tiers = [t.model_dump() for t in body.tiers]
    config.np_rate = body.np_rate
    config.np_percent = body.np_percent
    config.guarantee_rate = body.guarantee_rate
    config.commission_rate = body.commission_rate
    config.haircut_price = body.haircut_price
    config.color_price = body.color_price
    config.avg_ticket_haircut = body.avg_ticket_haircut
    config.avg_ticket_color = body.avg_ticket_color
    config.service_mix_haircut = body.service_mix_haircut
    config.min_services_per_day = body.min_services_per_day
    config.updated_by_id = admin.id
    config.updated_by_email = admin.email

    session.add(config)
    session.commit()
    session.refresh(config)

    record_audit(
        session,
        actor=admin,
        action="payment_logic.update",
        target_type="payment_logic_config",
        target_id=config.id,
        detail={
            "before": before,
            "after": {
                "tiers": config.tiers,
                "np_rate": config.np_rate,
                "guarantee_rate": config.guarantee_rate,
                "commission_rate": config.commission_rate,
                "haircut_price": config.haircut_price,
                "color_price": config.color_price,
            },
        },
    )
    return _to_read(config)


@router.post("/preview", response_model=PaymentLogicPreviewResponse)
def preview_payment_logic(
    body: PaymentLogicPreviewRequest,
    _: User = Depends(require_highest_admin),
) -> PaymentLogicPreviewResponse:
    """Show the numbers a *proposed* config would produce for a sample scenario.

    Read-only: nothing is persisted. Lets the admin confirm the impact before
    applying changes globally.
    """
    # Build an ephemeral config object from the proposed values (not saved).
    from app.models.payment_logic import PaymentLogicConfig

    proposed = PaymentLogicConfig(
        tiers=[t.model_dump() for t in body.config.tiers],
        np_rate=body.config.np_rate,
        np_percent=body.config.np_percent,
        guarantee_rate=body.config.guarantee_rate,
        commission_rate=body.config.commission_rate,
        haircut_price=body.config.haircut_price,
        color_price=body.config.color_price,
        avg_ticket_haircut=body.config.avg_ticket_haircut,
        avg_ticket_color=body.config.avg_ticket_color,
        service_mix_haircut=body.config.service_mix_haircut,
        min_services_per_day=body.config.min_services_per_day,
    )
    result = pl.preview(
        proposed,
        production=body.production,
        hours=body.hours,
        guarantee_rate=body.guarantee_rate,
        target_rate=body.target_rate,
        scheduled_hours=body.scheduled_hours,
    )
    return PaymentLogicPreviewResponse(**result)

"""Pay-plan calculation endpoints (stateless; no DB required)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.payplan import (
    EffectiveRateRequest,
    EffectiveRateResponse,
    WhatIfRequest,
    WhatIfResponse,
)
from app.services import pay_engine

# Protected: requires a valid user. In demo mode this is satisfied automatically
# (an admin is injected), so the calculators keep working with no login.
router = APIRouter(prefix="/payplan", tags=["payplan"], dependencies=[Depends(get_current_user)])


def _to_config(cfg) -> pay_engine.PayConfig:
    return pay_engine.PayConfig(
        guarantee_rate=cfg.guarantee_rate,
        commission_rate=cfg.commission_rate,
        avg_ticket_haircut=cfg.avg_ticket_haircut,
        avg_ticket_color=cfg.avg_ticket_color,
        service_mix_haircut=cfg.service_mix_haircut,
        min_services_per_day=cfg.min_services_per_day,
        salon_guarantee=cfg.salon_guarantee,
    )


@router.post("/effective-rate", response_model=EffectiveRateResponse)
def effective_rate(req: EffectiveRateRequest) -> EffectiveRateResponse:
    """Compute pay and the effective $/hr for a block of production + hours."""
    config = _to_config(req.config)
    guarantee = pay_engine.guarantee_rate_for(req.salon_id, config)
    result = pay_engine.effective_pay(
        production=req.production,
        hours=req.hours,
        guarantee_rate=guarantee,
        commission_rate=config.commission_rate,
    )
    return EffectiveRateResponse(**result)


@router.post("/what-if", response_model=WhatIfResponse)
def what_if(req: WhatIfRequest) -> WhatIfResponse:
    """Solve a what-if scenario for a target effective rate over a period."""
    config = _to_config(req.config)
    guarantee = pay_engine.guarantee_rate_for(req.salon_id, config)
    result = pay_engine.plan_what_if(
        target_rate=req.target_rate,
        scheduled_hours=req.scheduled_hours,
        production_to_date=req.production_to_date,
        remaining_days=req.remaining_days,
        config=config,
        guarantee_rate=guarantee,
        extra_hours=req.extra_hours,
        service_mix_haircut=req.service_mix_haircut,
    )
    return WhatIfResponse(**result)

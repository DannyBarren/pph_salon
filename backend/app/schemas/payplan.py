"""Request/response schemas for the pay-plan endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PayConfigIn(BaseModel):
    guarantee_rate: float = Field(16.0, ge=0)
    commission_rate: float = Field(0.42, gt=0, le=1)
    avg_ticket_haircut: float = Field(48.0, ge=0)
    avg_ticket_color: float = Field(135.0, ge=0)
    service_mix_haircut: float = Field(0.6, ge=0, le=1)
    min_services_per_day: float = Field(6.0, ge=0)
    salon_guarantee: dict[str, float] = Field(default_factory=dict)


class EffectiveRateRequest(BaseModel):
    production: float = Field(..., ge=0, description="Recorded production ($)")
    hours: float = Field(..., ge=0, description="Worked hours")
    salon_id: str | None = None
    config: PayConfigIn = PayConfigIn()


class EffectiveRateResponse(BaseModel):
    commission_pay: float
    guarantee_pay: float
    pay: float
    effective_rate: float
    pph: float
    on_guarantee: bool


class WhatIfRequest(BaseModel):
    target_rate: float = Field(..., gt=0, description="Target effective $/hr")
    scheduled_hours: float = Field(..., gt=0)
    production_to_date: float = Field(0.0, ge=0)
    remaining_days: int = Field(0, ge=0)
    extra_hours: float = Field(0.0, ge=0)
    service_mix_haircut: float | None = Field(None, ge=0, le=1)
    salon_id: str | None = None
    config: PayConfigIn = PayConfigIn()


class WhatIfResponse(BaseModel):
    guarantee_rate: float
    plan_hours: float
    target_pay: float
    required_production: float
    production_to_date: float
    remaining_production: float
    per_day_production: float
    projected_services: float
    projected_haircuts: float
    projected_colors: float
    avg_ticket: float
    below_guarantee: bool

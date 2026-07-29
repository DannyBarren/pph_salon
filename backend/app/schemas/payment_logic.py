"""Request/response schemas for the global payment-logic endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PaymentTier(BaseModel):
    """One row of the payment tier table."""

    pay_rate: float = Field(..., gt=0, description="Hourly pay rate ($/hr)")
    pph_required: float = Field(..., gt=0, description="Production-per-hour required to earn it")


class PaymentLogicRead(BaseModel):
    """The full global payment logic + a plain-language formula breakdown."""

    model_config = ConfigDict(from_attributes=True)

    tiers: list[PaymentTier]
    np_rate: float
    np_percent: float
    guarantee_rate: float
    commission_rate: float
    haircut_price: float
    color_price: float
    avg_ticket_haircut: float
    avg_ticket_color: float
    service_mix_haircut: float
    min_services_per_day: float
    updated_by_email: str | None = None
    updated_at: datetime | None = None
    # Populated by the endpoint (not stored on the model).
    formula: dict | None = None


class PaymentLogicUpdate(BaseModel):
    """A full replacement of the global payment logic (validated + audited)."""

    tiers: list[PaymentTier] = Field(..., min_length=1)
    np_rate: float = Field(..., gt=0, le=1)
    np_percent: float = Field(..., ge=0, le=1)
    guarantee_rate: float = Field(..., ge=0)
    commission_rate: float = Field(..., gt=0, le=1)
    haircut_price: float = Field(..., gt=0)
    color_price: float = Field(..., gt=0)
    avg_ticket_haircut: float = Field(..., gt=0)
    avg_ticket_color: float = Field(..., gt=0)
    service_mix_haircut: float = Field(..., ge=0, le=1)
    min_services_per_day: float = Field(..., ge=0)

    @field_validator("tiers")
    @classmethod
    def _tiers_unique_and_sane(cls, tiers: list[PaymentTier]) -> list[PaymentTier]:
        rates = [t.pay_rate for t in tiers]
        if len(set(rates)) != len(rates):
            raise ValueError("Duplicate pay_rate in tier table")
        return sorted(tiers, key=lambda t: t.pay_rate)

    @model_validator(mode="after")
    def _tiers_monotonic(self) -> PaymentLogicUpdate:
        """As pay_rate increases, the required PPH must not decrease."""
        prev_pph = None
        for t in self.tiers:
            if prev_pph is not None and t.pph_required < prev_pph:
                raise ValueError(
                    "pph_required must be non-decreasing as pay_rate increases"
                )
            prev_pph = t.pph_required
        return self


class PaymentLogicPreviewRequest(BaseModel):
    """Proposed logic + a sample scenario to evaluate it against."""

    config: PaymentLogicUpdate
    production: float = Field(..., ge=0)
    hours: float = Field(..., ge=0)
    guarantee_rate: float | None = Field(None, ge=0)
    target_rate: float | None = Field(None, gt=0)
    scheduled_hours: float | None = Field(None, ge=0)


class PaymentLogicPreviewResponse(BaseModel):
    pph: float
    effective_rate: float
    pay: float
    commission_pay: float
    guarantee_pay: float
    on_guarantee: bool
    guarantee_rate: float
    min_expected_production: float
    target_rate: float | None = None
    required_production_for_target: float | None = None
    remaining_production_for_target: float | None = None

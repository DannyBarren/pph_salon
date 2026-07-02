"""PayTier request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PayTierBase(BaseModel):
    salon_id: int
    desired_rate: float = Field(gt=0, description="Pay rate $/hr")
    pph: float = Field(gt=0, description="Production-per-hour required for the rate")


class PayTierCreate(PayTierBase):
    pass


class PayTierUpdate(BaseModel):
    desired_rate: float | None = Field(default=None, gt=0)
    pph: float | None = Field(default=None, gt=0)


class PayTierRead(PayTierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime

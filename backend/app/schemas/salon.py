"""Salon request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SalonBase(BaseModel):
    name: str
    city: str | None = None
    guarantee_rate: float | None = None


class SalonCreate(SalonBase):
    pass


class SalonUpdate(BaseModel):
    name: str | None = None
    city: str | None = None
    guarantee_rate: float | None = None


class SalonRead(SalonBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime

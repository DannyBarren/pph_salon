"""DailyPerformance request/response schemas."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class DailyPerformanceBase(BaseModel):
    date: date
    scheduled_hrs: float = 0.0
    actual_hrs: float | None = None
    actual_production: float | None = None
    haircuts: int | None = None
    colors: int | None = None


class DailyPerformanceCreate(DailyPerformanceBase):
    week_id: int


class DailyPerformanceUpdate(BaseModel):
    scheduled_hrs: float | None = None
    actual_hrs: float | None = None
    actual_production: float | None = None
    haircuts: int | None = None
    colors: int | None = None


class DailyPerformanceRead(DailyPerformanceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    week_id: int
    created_at: datetime
    updated_at: datetime

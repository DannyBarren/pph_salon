"""Week request/response schemas."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.daily_performance import DailyPerformanceRead


class WeekBase(BaseModel):
    stylist_id: int
    week_start: date
    scheduled_total_hrs: float = 0.0
    actual_total_hrs: float | None = None
    actual_production: float | None = None
    actual_haircuts: int | None = None
    actual_colors: int | None = None


class WeekCreate(WeekBase):
    pass


class WeekUpdate(BaseModel):
    scheduled_total_hrs: float | None = None
    actual_total_hrs: float | None = None
    actual_production: float | None = None
    actual_haircuts: int | None = None
    actual_colors: int | None = None


class WeekRead(WeekBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class WeekReadWithDays(WeekRead):
    daily_performances: list[DailyPerformanceRead] = []

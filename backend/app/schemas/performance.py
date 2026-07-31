"""Read schemas for historical performance (weeks + daily breakdown).

These power the frontend's historical pay-period / week selectors: the stored
``Week`` rows are grouped into pay periods so a user can pick a past period and
then a week within it, and fetch that week's aggregate + daily rows.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict


class StoredWeek(BaseModel):
    """A week that has stored performance data (for the selectors)."""

    model_config = ConfigDict(from_attributes=True)

    week_start: date
    week_end: date | None = None
    has_actuals: bool = False


class PayPeriodSummary(BaseModel):
    """A pay period (a run of consecutive weeks) that has stored data."""

    # 0-based index, newest first is applied by the endpoint ordering.
    period_start: date
    period_end: date
    weeks: list[StoredWeek]


class DailyPerformanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    scheduled_hrs: float = 0.0
    actual_hrs: float | None = None
    actual_production: float | None = None
    haircuts: int | None = None
    colors: int | None = None


class WeekPerformanceRead(BaseModel):
    """A stylist's stored week: aggregate totals + the daily breakdown."""

    model_config = ConfigDict(from_attributes=True)

    stylist_id: int
    week_start: date
    week_end: date | None = None
    scheduled_total_hrs: float = 0.0
    actual_total_hrs: float | None = None
    actual_production: float | None = None
    actual_haircuts: int | None = None
    actual_colors: int | None = None
    actual_other_value: float | None = None
    notes: str | None = None
    daily: list[DailyPerformanceRead] = []

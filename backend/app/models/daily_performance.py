"""DailyPerformance model — one day within a Week."""

from datetime import date as date_type
from typing import TYPE_CHECKING, Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.week import Week


class DailyPerformance(TimestampMixin, table=True):
    __tablename__ = "daily_performance"
    __table_args__ = (
        UniqueConstraint("week_id", "date", name="uq_daily_week_date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    week_id: int = Field(foreign_key="week.id", index=True)
    date: date_type = Field(index=True)

    scheduled_hrs: float = Field(default=0.0)
    actual_hrs: Optional[float] = Field(default=None)
    actual_production: Optional[float] = Field(default=None)
    haircuts: Optional[int] = Field(default=None)
    colors: Optional[int] = Field(default=None)

    week: Optional["Week"] = Relationship(back_populates="daily_performances")

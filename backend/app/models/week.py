"""Week model — a stylist's weekly schedule + actuals rollup."""

from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.daily_performance import DailyPerformance
    from app.models.user import User


class Week(TimestampMixin, table=True):
    __tablename__ = "week"
    __table_args__ = (
        UniqueConstraint("stylist_id", "week_start", name="uq_week_stylist_start"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    stylist_id: int = Field(foreign_key="users.id", index=True)
    week_start: date = Field(index=True)
    week_end: Optional[date] = Field(default=None)

    scheduled_total_hrs: float = Field(default=0.0)
    actual_total_hrs: Optional[float] = Field(default=None)
    actual_production: Optional[float] = Field(default=None)
    actual_haircuts: Optional[int] = Field(default=None)
    actual_colors: Optional[int] = Field(default=None)
    # Revenue from services other than haircuts/colors (retail, add-ons, etc.).
    actual_other_value: Optional[float] = Field(default=None)
    notes: Optional[str] = Field(default=None)

    stylist: Optional["User"] = Relationship(back_populates="weeks")
    daily_performances: list["DailyPerformance"] = Relationship(
        back_populates="week",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

"""PayTier model — the salon's PPH pay ladder (desired_rate -> required PPH)."""

from typing import TYPE_CHECKING, Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.salon import Salon


class PayTier(TimestampMixin, table=True):
    __tablename__ = "pay_tier"
    __table_args__ = (
        UniqueConstraint("salon_id", "desired_rate", name="uq_pay_tier_salon_rate"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    salon_id: int = Field(foreign_key="salon.id", index=True)
    # Pay rate ($/hr) and the production-per-hour required to earn it.
    desired_rate: float = Field(index=True)
    pph: float = Field()

    salon: Optional["Salon"] = Relationship(back_populates="pay_tiers")

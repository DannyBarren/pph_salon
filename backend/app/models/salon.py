"""Salon model."""

from typing import TYPE_CHECKING, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin

if TYPE_CHECKING:  # avoid runtime circular imports; only for type checkers
    from app.models.pay_tier import PayTier
    from app.models.user import User


def default_service_prices() -> dict[str, float]:
    """Baseline per-service production values from the workbook (haircut $23, color $85)."""
    return {"haircut": 23.0, "color": 85.0}


class Salon(TimestampMixin, table=True):
    __tablename__ = "salon"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    city: Optional[str] = Field(default=None)
    # Alias kept for compatibility with the spec's ``location`` naming.
    location: Optional[str] = Field(default=None)
    # Per-salon guarantee $/hr override (falls back to the global config).
    guarantee_rate: Optional[float] = Field(default=None)
    # Configurable per-service prices, e.g. {"haircut": 23, "color": 85, ...}.
    service_prices: dict[str, float] = Field(
        default_factory=default_service_prices,
        sa_column=Column(JSON, nullable=False),
    )

    users: list["User"] = Relationship(back_populates="salon")
    pay_tiers: list["PayTier"] = Relationship(
        back_populates="salon",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

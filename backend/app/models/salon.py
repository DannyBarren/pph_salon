"""Salon model."""

from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship

from app.models.base import TimestampMixin

if TYPE_CHECKING:  # avoid runtime circular imports; only for type checkers
    from app.models.pay_tier import PayTier
    from app.models.user import User


class Salon(TimestampMixin, table=True):
    __tablename__ = "salon"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    city: Optional[str] = Field(default=None)
    # Per-salon guarantee $/hr override (falls back to the global config).
    guarantee_rate: Optional[float] = Field(default=None)

    users: list["User"] = Relationship(back_populates="salon")
    pay_tiers: list["PayTier"] = Relationship(
        back_populates="salon",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

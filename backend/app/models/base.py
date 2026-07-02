"""Shared model mixins."""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Timezone-aware UTC now (used for created/updated defaults)."""
    return datetime.now(UTC)


class TimestampMixin(SQLModel):
    """Adds ``created_at`` / ``updated_at`` columns to a table model.

    ``updated_at`` is refreshed on every ORM update via SQLAlchemy's ``onupdate``.
    """

    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={"onupdate": utcnow},
    )

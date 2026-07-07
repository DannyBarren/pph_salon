"""weekly data fields, salon service prices, owner role

Adds:
- salon.location, salon.service_prices (JSON)
- users.phone, users.guarantee_rate, and the 'owner' UserRole enum value
- week.week_end, week.actual_other_value, week.notes

Revision ID: b1f2a3c4d5e6
Revises: aa6945c404fc
Create Date: 2026-07-07 21:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel  # noqa: F401 - SQLModel column types used in migrations
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1f2a3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "aa6945c404fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # Add the 'owner' value to the userrole enum (PostgreSQL only; SQLite stores
    # enums as plain strings so no change is needed there).
    if is_postgres:
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'owner'")

    # ── salon ────────────────────────────────────────────────────────────
    with op.batch_alter_table("salon", schema=None) as batch_op:
        batch_op.add_column(sa.Column("location", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "service_prices",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{\"haircut\": 23, \"color\": 85}'"),
            )
        )

    # ── users ────────────────────────────────────────────────────────────
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("phone", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("guarantee_rate", sa.Float(), nullable=True))

    # ── week ─────────────────────────────────────────────────────────────
    with op.batch_alter_table("week", schema=None) as batch_op:
        batch_op.add_column(sa.Column("week_end", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("actual_other_value", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("notes", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("week", schema=None) as batch_op:
        batch_op.drop_column("notes")
        batch_op.drop_column("actual_other_value")
        batch_op.drop_column("week_end")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("guarantee_rate")
        batch_op.drop_column("phone")

    with op.batch_alter_table("salon", schema=None) as batch_op:
        batch_op.drop_column("service_prices")
        batch_op.drop_column("location")

    # Note: PostgreSQL cannot easily drop an enum value; the 'owner' value on
    # userrole is left in place on downgrade.

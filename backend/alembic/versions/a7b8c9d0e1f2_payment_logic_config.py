"""global payment logic config

Adds the single-row ``payment_logic_config`` table — the organisation-wide
source of truth for the payment tier table, NP rate, guarantee rate, service
prices, and all other calculation parameters. The row is seeded lazily on first
access by ``app.services.payment_logic.get_or_create_config``.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-29 14:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel  # noqa: F401 - SQLModel column types used in migrations
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_logic_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tiers", sa.JSON(), nullable=False),
        sa.Column("np_rate", sa.Float(), nullable=False),
        sa.Column("np_percent", sa.Float(), nullable=False),
        sa.Column("guarantee_rate", sa.Float(), nullable=False),
        sa.Column("commission_rate", sa.Float(), nullable=False),
        sa.Column("haircut_price", sa.Float(), nullable=False),
        sa.Column("color_price", sa.Float(), nullable=False),
        sa.Column("avg_ticket_haircut", sa.Float(), nullable=False),
        sa.Column("avg_ticket_color", sa.Float(), nullable=False),
        sa.Column("service_mix_haircut", sa.Float(), nullable=False),
        sa.Column("min_services_per_day", sa.Float(), nullable=False),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("payment_logic_config")

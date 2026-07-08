"""goals + notifications

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-08 14:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel  # noqa: F401
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "goal",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stylist_id", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("target_pph", sa.Float(), nullable=False),
        sa.Column("target_hours", sa.Float(), nullable=False),
        sa.Column("target_haircuts", sa.Integer(), nullable=False),
        sa.Column("target_colors", sa.Integer(), nullable=False),
        sa.Column("set_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("previous_goal_id", sa.Integer(), nullable=True),
        sa.Column("approval_status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("manager_comment", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["stylist_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["previous_goal_id"], ["goal.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("goal", schema=None) as b:
        b.create_index(b.f("ix_goal_stylist_id"), ["stylist_id"], unique=False)
        b.create_index(b.f("ix_goal_week_start"), ["week_start"], unique=False)
        b.create_index(b.f("ix_goal_is_active"), ["is_active"], unique=False)
        b.create_index(b.f("ix_goal_approval_status"), ["approval_status"], unique=False)

    op.create_table(
        "notification",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("message", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("goal_id", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["goal_id"], ["goal.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notification", schema=None) as b:
        b.create_index(b.f("ix_notification_recipient_id"), ["recipient_id"], unique=False)
        b.create_index(b.f("ix_notification_type"), ["type"], unique=False)
        b.create_index(b.f("ix_notification_is_read"), ["is_read"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("notification", schema=None) as b:
        b.drop_index(b.f("ix_notification_is_read"))
        b.drop_index(b.f("ix_notification_type"))
        b.drop_index(b.f("ix_notification_recipient_id"))
    op.drop_table("notification")
    with op.batch_alter_table("goal", schema=None) as b:
        b.drop_index(b.f("ix_goal_approval_status"))
        b.drop_index(b.f("ix_goal_is_active"))
        b.drop_index(b.f("ix_goal_week_start"))
        b.drop_index(b.f("ix_goal_stylist_id"))
    op.drop_table("goal")

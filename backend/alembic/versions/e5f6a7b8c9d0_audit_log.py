"""audit log

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-14 00:40:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel  # noqa: F401
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("actor_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("actor_role", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("action", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("target_type", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("target_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("salon_id", sa.Integer(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("audit_log", schema=None) as b:
        b.create_index(b.f("ix_audit_log_actor_id"), ["actor_id"], unique=False)
        b.create_index(b.f("ix_audit_log_action"), ["action"], unique=False)
        b.create_index(b.f("ix_audit_log_target_type"), ["target_type"], unique=False)
        b.create_index(b.f("ix_audit_log_salon_id"), ["salon_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("audit_log", schema=None) as b:
        b.drop_index(b.f("ix_audit_log_salon_id"))
        b.drop_index(b.f("ix_audit_log_target_type"))
        b.drop_index(b.f("ix_audit_log_action"))
        b.drop_index(b.f("ix_audit_log_actor_id"))
    op.drop_table("audit_log")

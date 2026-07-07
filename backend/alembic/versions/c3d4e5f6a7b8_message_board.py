"""message board posts + acknowledgments

Revision ID: c3d4e5f6a7b8
Revises: aa6945c404fc
Create Date: 2026-07-07 21:50:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel  # noqa: F401 - SQLModel column types used in migrations
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "aa6945c404fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_board_post",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("author_role", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("salon_id", sa.Integer(), nullable=True),
        sa.Column("target_audience", sa.JSON(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("content", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["salon_id"], ["salon.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("message_board_post", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_message_board_post_author_id"), ["author_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_message_board_post_author_role"), ["author_role"], unique=False)
        batch_op.create_index(batch_op.f("ix_message_board_post_salon_id"), ["salon_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_message_board_post_is_pinned"), ["is_pinned"], unique=False)

    op.create_table(
        "message_acknowledgment",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["message_board_post.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_ack_post_user"),
    )
    with op.batch_alter_table("message_acknowledgment", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_message_acknowledgment_post_id"), ["post_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_message_acknowledgment_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("message_acknowledgment", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_message_acknowledgment_user_id"))
        batch_op.drop_index(batch_op.f("ix_message_acknowledgment_post_id"))
    op.drop_table("message_acknowledgment")

    with op.batch_alter_table("message_board_post", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_message_board_post_is_pinned"))
        batch_op.drop_index(batch_op.f("ix_message_board_post_salon_id"))
        batch_op.drop_index(batch_op.f("ix_message_board_post_author_role"))
        batch_op.drop_index(batch_op.f("ix_message_board_post_author_id"))
    op.drop_table("message_board_post")

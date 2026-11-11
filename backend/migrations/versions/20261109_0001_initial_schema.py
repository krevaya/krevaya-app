"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "library_elements",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("tags", sa.String(length=500), nullable=False),
        sa.Column("svg", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_library_elements")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("google_sub", sa.String(length=255), nullable=True),
        sa.Column("oidc_sub", sa.String(length=255), nullable=True),
        sa.Column("prefs", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("google_sub", name=op.f("uq_users_google_sub")),
        sa.UniqueConstraint("oidc_sub", name=op.f("uq_users_oidc_sub")),
    )
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_users_email"), ["email"], unique=True)

    op.create_table(
        "api_tokens",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("prefix", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_api_tokens_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_api_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_api_tokens_token_hash")),
    )
    with op.batch_alter_table("api_tokens", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_api_tokens_user_id"), ["user_id"], unique=False)

    op.create_table(
        "assets",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.String(length=32), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("key", sa.String(length=500), nullable=False),
        sa.Column("mime", sa.String(length=100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_assets_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assets")),
    )
    with op.batch_alter_table("assets", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_assets_owner_id"), ["owner_id"], unique=False)

    op.create_table(
        "brand_kits",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("colors", sa.JSON(), nullable=False),
        sa.Column("fonts", sa.JSON(), nullable=False),
        sa.Column("logos", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_brand_kits_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_brand_kits")),
    )
    with op.batch_alter_table("brand_kits", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_brand_kits_owner_id"), ["owner_id"], unique=False)

    op.create_table(
        "designs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.String(length=32), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("doc", sa.JSON(), nullable=False),
        sa.Column("ystate", sa.LargeBinary(), nullable=True),
        sa.Column("thumbnail", sa.String(length=500), nullable=False),
        sa.Column("is_template", sa.Boolean(), nullable=False),
        sa.Column("template_category", sa.String(length=60), nullable=False),
        sa.Column("template_order", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_designs_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_designs")),
    )
    with op.batch_alter_table("designs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_designs_is_template"), ["is_template"], unique=False)
        batch_op.create_index(batch_op.f("ix_designs_owner_id"), ["owner_id"], unique=False)

    op.create_table(
        "email_tokens",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_email_tokens_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_tokens")),
    )
    with op.batch_alter_table("email_tokens", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_email_tokens_user_id"), ["user_id"], unique=False)

    op.create_table(
        "fonts",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.String(length=32), nullable=True),
        sa.Column("family", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("license", sa.String(length=40), nullable=False),
        sa.Column("files", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_fonts_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fonts")),
    )
    with op.batch_alter_table("fonts", schema=None) as batch_op:
        batch_op.create_index("ix_fonts_owner_family", ["owner_id", "family"], unique=False)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_sessions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
    )
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sessions_user_id"), ["user_id"], unique=False)

    op.create_table(
        "comments",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("design_id", sa.String(length=32), nullable=False),
        sa.Column("parent_id", sa.String(length=32), nullable=True),
        sa.Column("page_id", sa.String(length=40), nullable=False),
        sa.Column("x", sa.Double(), nullable=True),
        sa.Column("y", sa.Double(), nullable=True),
        sa.Column("author_id", sa.String(length=32), nullable=True),
        sa.Column("guest_name", sa.String(length=80), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_comments_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["design_id"], ["designs.id"], name=op.f("fk_comments_design_id_designs"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["comments.id"], name=op.f("fk_comments_parent_id_comments"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_comments")),
    )
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_comments_design_id"), ["design_id"], unique=False)

    op.create_table(
        "design_versions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("design_id", sa.String(length=32), nullable=False),
        sa.Column("author_id", sa.String(length=32), nullable=True),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("auto", sa.Boolean(), nullable=False),
        sa.Column("doc", sa.JSON(), nullable=False),
        sa.Column("ystate", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_design_versions_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["design_id"],
            ["designs.id"],
            name=op.f("fk_design_versions_design_id_designs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_design_versions")),
    )
    with op.batch_alter_table("design_versions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_design_versions_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_design_versions_design_id"), ["design_id"], unique=False)

    op.create_table(
        "share_links",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("design_id", sa.String(length=32), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_share_links_created_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["design_id"], ["designs.id"], name=op.f("fk_share_links_design_id_designs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_share_links")),
        sa.UniqueConstraint("token", name=op.f("uq_share_links_token")),
    )
    with op.batch_alter_table("share_links", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_share_links_design_id"), ["design_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("share_links", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_share_links_design_id"))

    op.drop_table("share_links")
    with op.batch_alter_table("design_versions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_design_versions_design_id"))
        batch_op.drop_index(batch_op.f("ix_design_versions_created_at"))

    op.drop_table("design_versions")
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_comments_design_id"))

    op.drop_table("comments")
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sessions_user_id"))

    op.drop_table("sessions")
    with op.batch_alter_table("fonts", schema=None) as batch_op:
        batch_op.drop_index("ix_fonts_owner_family")

    op.drop_table("fonts")
    with op.batch_alter_table("email_tokens", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_email_tokens_user_id"))

    op.drop_table("email_tokens")
    with op.batch_alter_table("designs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_designs_owner_id"))
        batch_op.drop_index(batch_op.f("ix_designs_is_template"))

    op.drop_table("designs")
    with op.batch_alter_table("brand_kits", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_brand_kits_owner_id"))

    op.drop_table("brand_kits")
    with op.batch_alter_table("assets", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_assets_owner_id"))

    op.drop_table("assets")
    with op.batch_alter_table("api_tokens", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_api_tokens_user_id"))

    op.drop_table("api_tokens")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_email"))

    op.drop_table("users")
    op.drop_table("library_elements")

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, Timestamps, utcnow


def new_id() -> str:
    return uuid.uuid4().hex


class User(Timestamps, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    oidc_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    prefs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    def __str__(self) -> str:
        return self.email


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256 of the cookie value
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    user_agent: Mapped[str] = mapped_column(String(255), default="")

    user: Mapped[User] = relationship(lazy="joined")


class EmailToken(Base):
    __tablename__ = "email_tokens"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(20))  # verify | reset
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    prefix: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_used_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]

    user: Mapped[User] = relationship(lazy="joined")


class Design(Timestamps, Base):
    __tablename__ = "designs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Untitled design")
    width: Mapped[int] = mapped_column(Integer, default=1080)
    height: Mapped[int] = mapped_column(Integer, default=1080)
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    # `doc` is a plain JSON copy of the Yjs state, refreshed on save. It's what the
    # API, the thumbnailer and the assistant read; `ystate` is the source of truth.
    doc: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ystate: Mapped[bytes | None] = mapped_column(LargeBinary)
    thumbnail: Mapped[str] = mapped_column(String(500), default="")
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    template_category: Mapped[str] = mapped_column(String(60), default="")
    template_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None]

    owner: Mapped[User | None] = relationship(lazy="joined")

    def __str__(self) -> str:
        return self.title


class DesignVersion(Base):
    __tablename__ = "design_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    design_id: Mapped[str] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    label: Mapped[str] = mapped_column(String(120), default="")
    auto: Mapped[bool] = mapped_column(Boolean, default=True)
    doc: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ystate: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)

    author: Mapped[User | None] = relationship(lazy="joined")


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    design_id: Mapped[str] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(10), default="view")  # view | comment | edit
    password_hash: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    revoked_at: Mapped[datetime | None]

    design: Mapped[Design] = relationship(lazy="joined")


class Comment(Timestamps, Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    design_id: Mapped[str] = mapped_column(ForeignKey("designs.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"))
    page_id: Mapped[str] = mapped_column(String(40), default="")
    x: Mapped[float | None]
    y: Mapped[float | None]
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    guest_name: Mapped[str] = mapped_column(String(80), default="")
    body: Mapped[str] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    author: Mapped[User | None] = relationship(lazy="joined")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="image")  # image | audio | font | video
    filename: Mapped[str] = mapped_column(String(255), default="")
    key: Mapped[str] = mapped_column(String(500))
    mime: Mapped[str] = mapped_column(String(100), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int | None]
    height: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class BrandKit(Timestamps, Base):
    __tablename__ = "brand_kits"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="My brand")
    colors: Mapped[list[str]] = mapped_column(JSON, default=list)
    fonts: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # {heading, subheading, body}
    logos: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class Font(Base):
    __tablename__ = "fonts"
    __table_args__ = (Index("ix_fonts_owner_family", "owner_id", "family"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    family: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40), default="sans-serif")
    license: Mapped[str] = mapped_column(String(40), default="OFL-1.1")
    # [{"weight": 400, "style": "normal", "url": "..."}]
    files: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    def __str__(self) -> str:
        return self.family


class LibraryElement(Base):
    """Illustrations and stickers an admin adds on top of the built-in set."""

    __tablename__ = "library_elements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(20), default="illustration")  # illustration | sticker
    name: Mapped[str] = mapped_column(String(120))
    tags: Mapped[str] = mapped_column(String(500), default="")
    svg: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    def __str__(self) -> str:
        return self.name

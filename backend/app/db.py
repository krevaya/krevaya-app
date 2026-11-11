from collections.abc import AsyncIterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, TypeDecorator, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import get_settings

settings = get_settings()

if settings.is_sqlite:
    settings.data_dir.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=not settings.is_sqlite,
    connect_args={"timeout": 30} if settings.is_sqlite else {},
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

if settings.is_sqlite:
    # sqlite ignores ON DELETE CASCADE unless foreign keys are switched on per connection
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(conn, _record):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """sqlite drops the time zone, so times come back naive; they're always utc."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )
    type_annotation_map = {datetime: UTCDateTime()}


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session

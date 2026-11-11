import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import get_settings
from app.db import Base, engine

config = context.config
if config.config_file_name is not None and not config.attributes.get("skip_logging"):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _configure(**kw) -> None:
    context.configure(
        target_metadata=target_metadata,
        # sqlite can't ALTER most things, so changes there go through table copies
        render_as_batch=get_settings().is_sqlite,
        compare_type=True,
        **kw,
    )


def run_migrations_offline() -> None:
    _configure(url=get_settings().database_url, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def _run(connection: Connection) -> None:
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    async with engine.connect() as connection:
        await connection.run_sync(_run)
        await connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
    else:
        asyncio.run(run_migrations_online())

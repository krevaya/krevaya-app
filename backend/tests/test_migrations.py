import tempfile
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from app.cli import BACKEND_DIR
from app.db import Base


def test_migrations_match_models():
    path = Path(tempfile.mkdtemp()) / "migrate.db"
    eng = create_engine(f"sqlite:///{path}")
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["skip_logging"] = True
    with eng.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    with eng.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        assert compare_metadata(ctx, Base.metadata) == []
    with eng.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "base")
    eng.dispose()

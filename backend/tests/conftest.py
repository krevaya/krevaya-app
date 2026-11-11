import os
import tempfile
import uuid
from pathlib import Path

# settings are read once at import time, so the environment has to be ready first
_tmp = Path(tempfile.mkdtemp(prefix="krevaya-app-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp / 'test.db'}"
os.environ["DATA_DIR"] = str(_tmp)
os.environ["SECRET_KEY"] = "test-secret"
os.environ["SITE_URL"] = "http://testserver"
os.environ["RATE_LIMIT_LOGIN"] = "1000/minute"
os.environ["ASSISTANT_API"] = "true"
os.environ.setdefault("REDIS_URL", "")

import httpx  # noqa: E402
import pytest  # noqa: E402

from app import hub as hub_module  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

hub_module.SAVE_DELAY = 0


@pytest.fixture(scope="session", autouse=True)
async def _tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await hub_module.hub.flush_all()
    await engine.dispose()


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


@pytest.fixture
async def anon():
    async with _client() as c:
        yield c


@pytest.fixture
async def make_user():
    """Returns a function that signs up a fresh user and gives back a logged-in client."""
    clients = []

    async def make(name: str = "Sam", password: str = "password123") -> httpx.AsyncClient:
        c = _client()
        clients.append(c)
        email = f"{name.lower()}-{uuid.uuid4().hex[:8]}@example.com"
        r = await c.post("/api/auth/signup", json={"email": email, "password": password, "name": name})
        assert r.status_code == 200, r.text
        c.user = r.json()
        c.email = email
        c.password = password
        return c

    yield make
    for c in clients:
        await c.aclose()


@pytest.fixture
async def user(make_user):
    return await make_user()


@pytest.fixture
async def design(user):
    r = await user.post("/api/designs", json={"title": "Poster", "width": 800, "height": 600})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
async def mcp_running():
    # the session manager can only be started once per process
    # and anyio wants it entered and left in the same task, so it gets its own
    import asyncio

    from app.mcp_server import mcp

    started, stop = asyncio.Event(), asyncio.Event()

    async def run():
        async with mcp.session_manager.run():
            started.set()
            await stop.wait()

    task = asyncio.create_task(run())
    await started.wait()
    yield
    stop.set()
    await task


async def make_admin(c: httpx.AsyncClient, flag: bool = True) -> None:
    from sqlalchemy import update

    from app.db import SessionLocal
    from app.models import User

    async with SessionLocal() as db:
        await db.execute(update(User).where(User.id == c.user["id"]).values(is_admin=flag))
        await db.commit()

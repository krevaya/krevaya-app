"""Server housekeeping, run from backend/:

    python -m app.cli migrate                  # apply database migrations
    python -m app.cli create-admin --email ... # new admin, or promote an existing account
    python -m app.cli seed [--only templates|fonts]
"""

import argparse
import asyncio
import getpass
import importlib
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def migrate(revision: str = "head") -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(cfg, revision)


async def create_admin(email: str, password: str, name: str = "") -> str:
    from sqlalchemy import select

    from .db import SessionLocal
    from .models import User
    from .security import hash_password

    email = email.strip().lower()
    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(email=email, name=name, email_verified=True)
            db.add(user)
            verb = "Created"
        else:
            verb = "Updated"
        user.is_admin = True
        user.is_active = True
        if password:
            user.password_hash = hash_password(password)
        await db.commit()
    return f"{verb} admin {email}"


def _optional(module: str, func: str):
    try:
        mod = importlib.import_module(module)
    except ModuleNotFoundError as e:
        # only swallow "the module isn't there", not a broken import inside it
        if e.name and module.startswith(e.name):
            return None
        raise
    return getattr(mod, func, None)


async def seed(only: str | None = None) -> list[str]:
    from .db import SessionLocal

    jobs = [
        ("templates", "app.content.templates", "seed_templates"),
        ("fonts", "app.content.font_catalog", "seed_fonts"),
    ]
    out = []
    for name, module, func in jobs:
        if only and only != name:
            continue
        fn = _optional(module, func)
        if fn is None:
            out.append(f"{name}: skipped ({module} isn't available)")
            continue
        async with SessionLocal() as db:
            count = await fn(db)
        out.append(f"{name}: {count} added or updated")
    return out


def _run(coro):
    from .db import engine

    async def go():
        try:
            return await coro
        finally:
            await engine.dispose()

    return asyncio.run(go())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Krevaya server housekeeping")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("migrate", help="apply any pending database migrations")
    p.add_argument("revision", nargs="?", default="head")

    p = sub.add_parser("create-admin", help="add an admin, or give an existing account admin rights")
    p.add_argument("--email")
    p.add_argument("--password", help="asked for interactively when left out")
    p.add_argument("--name", default="")
    p.add_argument("--no-password", action="store_true", help="no password, for SSO-only accounts")

    p = sub.add_parser("seed", help="install or refresh the starter templates and bundled fonts")
    p.add_argument("--only", choices=["templates", "fonts"])

    args = parser.parse_args(argv)

    if args.cmd == "migrate":
        migrate(args.revision)
        return 0

    if args.cmd == "create-admin":
        email = args.email or input("Email: ")
        if not email or "@" not in email:
            print("A valid email is required", file=sys.stderr)
            return 1
        password = args.password or ""
        if not password and not args.no_password:
            password = getpass.getpass("Password: ")
            if password != getpass.getpass("Password again: "):
                print("Passwords don't match", file=sys.stderr)
                return 1
        if password and len(password) < 8:
            print("Use at least 8 characters", file=sys.stderr)
            return 1
        print(_run(create_admin(email, password, args.name)))
        return 0

    if args.cmd == "seed":
        for line in _run(seed(args.only)):
            print(line)
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())

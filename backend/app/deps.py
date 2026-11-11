from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import ApiToken, Session, User
from .security import sha256

COOKIE = "ka_session"


async def _from_cookie(request: Request, db: AsyncSession) -> User | None:
    raw = request.cookies.get(COOKIE)
    if not raw:
        return None
    sess = await db.get(Session, sha256(raw))
    if sess is None:
        return None
    expires = sess.expires_at if sess.expires_at.tzinfo else sess.expires_at.replace(tzinfo=UTC)
    if expires < datetime.now(UTC) or not sess.user.is_active:
        return None
    return sess.user


async def _from_bearer(request: Request, db: AsyncSession) -> User | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    row = (
        await db.execute(select(ApiToken).where(ApiToken.token_hash == sha256(token)))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None or not row.user.is_active:
        raise HTTPException(401, "Invalid API token")
    row.last_used_at = datetime.now(UTC)
    await db.commit()
    request.state.api_token = True
    return row.user


async def optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    user = await _from_bearer(request, db)
    if user is None:
        user = await _from_cookie(request, db)
    request.state.user = user
    return user


async def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(401, "Sign in first")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Admins only")
    return user

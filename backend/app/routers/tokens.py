"""Personal API tokens, for scripts and the MCP endpoint. Sent as `Authorization: Bearer ka_...`."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import current_user
from ..models import ApiToken, User
from ..security import new_token, sha256

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

MAX_TOKENS = 50


class TokenIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


def token_out(t: ApiToken) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "prefix": t.prefix,
        "created_at": t.created_at.isoformat(),
        "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
    }


def _session_only(request: Request) -> None:
    # a leaked token shouldn't be able to mint more tokens
    if getattr(request.state, "api_token", False):
        raise HTTPException(403, "Manage API tokens from your account settings")


@router.get("")
async def list_tokens(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ApiToken).where(ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None))
        .order_by(ApiToken.created_at.desc())
    )).scalars().all()
    return {"tokens": [token_out(t) for t in rows]}


@router.post("")
async def create_token(body: TokenIn, request: Request, user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    _session_only(request)
    count = (await db.execute(select(func.count(ApiToken.id)).where(
        ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None)))).scalar_one()
    if count >= MAX_TOKENS:
        raise HTTPException(400, "You have too many tokens. Revoke one you don't use first.")
    raw = "ka_" + new_token(32)
    t = ApiToken(user_id=user.id, name=body.name.strip(), token_hash=sha256(raw), prefix=raw[:11])
    db.add(t)
    await db.commit()
    # the only time the raw token is ever shown
    return {**token_out(t), "token": raw}


@router.delete("/{token_id}")
async def revoke_token(token_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    t =await db.get(ApiToken, token_id)
    if t is None or t.user_id != user.id or t.revoked_at is not None:
        raise HTTPException(404, "Token not found")
    t.revoked_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}

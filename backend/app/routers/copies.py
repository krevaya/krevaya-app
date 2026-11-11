from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .. import slots
from ..access import load_design
from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import Design, User
from ..ratelimit import enforce

router = APIRouter(prefix="/api/designs", tags=["copies"])
settings = get_settings()


class CopiesIn(BaseModel):
    # one object per copy, slot name -> value; [{}] makes a plain copy
    rows: list[dict[str, Any]] = Field(min_length=1)
    # a slot whose value names each copy
    title_from: str | None = None
    title: str | None = Field(default=None, max_length=200)


async def _source(db: AsyncSession, design_id: str, user: User, request: Request) -> Design:
    design, role = await load_design(db, design_id, user, request, "view")
    if not slots.can_copy(design, role):
        raise HTTPException(403, "Copying with new values needs edit access")
    return design


@router.get("/{design_id}/slots")
async def design_slots(design_id: str, request: Request, user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    design = await _source(db, design_id, user, request)
    return {"slots": slots.list_slots(await slots.source_doc(design))}


@router.post("/{design_id}/copies")
async def make_copies(design_id: str, body: CopiesIn, request: Request, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    source = await _source(db, design_id, user, request)
    run = slots.CopyRun(user)
    try:
        if len(body.rows) > 1:
            return await slots.make_copies(db, run, source, body.rows, body.title_from, body.title)
        # a single copy that can't be made is an error rather than a partial result
        await enforce(f"copies:{user.id}", settings.rate_limit_copies)
        row = body.rows[0]
        title = str(row.get(body.title_from) or "") if body.title_from else ""
        d = await slots.make_copy(db, run, source, row, title or body.title)
    except slots.SlotError as e:
        raise HTTPException(400, str(e)) from e
    return {"made": [{"id": d.id, "title": d.title}], "failed": []}

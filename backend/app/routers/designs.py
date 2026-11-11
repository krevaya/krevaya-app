import base64
import binascii
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import docmodel, storage
from ..access import load_design
from ..db import get_db
from ..deps import admin_user, current_user, optional_user
from ..hub import hub
from ..models import Design, DesignVersion, Font, User, new_id

router = APIRouter(prefix="/api", tags=["designs"])

MAX_STATE = 20 * 1024 * 1024
MAX_THUMB = 2 * 1024 * 1024


class CreateIn(BaseModel):
    title: str = Field(default="Untitled design", max_length=200)
    width: int = Field(default=1080, ge=16, le=8000)
    height: int = Field(default=1080, ge=16, le=8000)
    template_id: str | None = None
    doc: dict | None = None


class PatchIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class TemplateIn(BaseModel):
    is_template: bool
    category: str = Field(default="", max_length=60)
    order: int = 0


class VersionIn(BaseModel):
    label: str = Field(default="", max_length=120)


class GuestDesign(BaseModel):
    title: str = Field(default="Untitled design", max_length=200)
    state: str  # base64 Yjs update
    thumbnail: str | None = None  # data URL


class ImportIn(BaseModel):
    designs: list[GuestDesign] = Field(max_length=200)


def design_out(d: Design, role: str | None = None, with_doc: bool = False) -> dict:
    out = {
        "id": d.id,
        "title": d.title,
        "width": d.width,
        "height": d.height,
        "page_count": d.page_count,
        "thumbnail": d.thumbnail,
        "is_template": d.is_template,
        "template_category": d.template_category,
        "template_order": d.template_order,
        "created_at": d.created_at.isoformat(),
        "updated_at": d.updated_at.isoformat(),
        "deleted_at": d.deleted_at.isoformat() if d.deleted_at else None,
    }
    if role:
        out["role"] = role
    if with_doc:
        out["doc"] = d.doc
    return out


async def new_design(db: AsyncSession, owner: User | None, title: str, state: bytes) -> Design:
    data = docmodel.state_to_json(state)
    w, h, n = docmodel.summary(data)
    design = Design(owner_id=owner.id if owner else None, title=title or "Untitled design",
                    ystate=state, doc=data, width=w, height=h, page_count=n)
    db.add(design)
    await db.commit()
    return design


@router.get("/designs")
async def list_designs(trash: bool = False, q: str = "", limit: int = 100, offset: int = 0,
                       user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Design).where(Design.owner_id == user.id)
    stmt = stmt.where(Design.deleted_at.is_not(None) if trash else Design.deleted_at.is_(None))
    if q:
        stmt = stmt.where(Design.title.ilike(f"%{q}%"))
    stmt = stmt.order_by(Design.updated_at.desc()).limit(min(limit, 200)).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return {"designs": [design_out(d) for d in rows]}


@router.post("/designs")
async def create_design(body: CreateIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.template_id:
        tpl = await db.get(Design, body.template_id)
        if tpl is None or not (tpl.is_template or tpl.owner_id == user.id):
            raise HTTPException(404, "Template not found")
        state = tpl.ystate or docmodel.from_json(tpl.doc)
        title = body.title if body.title != "Untitled design" else tpl.title
    elif body.doc is not None:
        try:
            state = docmodel.from_json(body.doc)
        except Exception as e:
            raise HTTPException(400, "That design data couldn't be read") from e
        title = body.title
    else:
        state = docmodel.from_json(docmodel.blank(body.width, body.height))
        title = body.title
    design = await new_design(db, user, title, state)
    if body.template_id:
        # same pages as the template, so its picture is right until the editor makes a fresh one
        design.thumbnail = tpl.thumbnail
        await db.commit()
    return design_out(design, "owner")


@router.post("/designs/import-guest")
async def import_guest(body: ImportIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Move designs a guest made in the browser into their new account."""
    ids = []
    for g in body.designs:
        try:
            state = base64.b64decode(g.state)
        except binascii.Error as e:
            raise HTTPException(400, "Bad design data") from e
        if len(state) > MAX_STATE:
            continue
        try:
            docmodel.load(state)
        except Exception:
            continue
        design = await new_design(db, user, g.title, state)
        if g.thumbnail:
            await _store_thumbnail(db, design, _decode_data_url(g.thumbnail))
        ids.append(design.id)
    return {"ids": ids}


@router.get("/designs/{design_id}")
async def get_design(design_id: str, request: Request, user: User | None = Depends(optional_user),
                     db: AsyncSession = Depends(get_db)):
    design, role = await load_design(db, design_id, user, request)
    return design_out(design, role, with_doc=True)


@router.patch("/designs/{design_id}")
async def patch_design(design_id: str, body: PatchIn, request: Request,
                       user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    design, role = await load_design(db, design_id, user, request, "edit")
    if body.title is not None:
        design.title = body.title.strip() or "Untitled design"
    await db.commit()
    return design_out(design, role)


@router.delete("/designs/{design_id}")
async def delete_design(design_id: str, request: Request, permanent: bool = False,
                        user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    design, _ = await load_design(db, design_id, user, request, "owner")
    if permanent:
        await db.delete(design)
        hub.rooms.pop(design_id, None)
    else:
        design.deleted_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}


@router.post("/designs/{design_id}/restore")
async def restore_design(design_id: str, request: Request, user: User = Depends(current_user),
                         db: AsyncSession = Depends(get_db)):
    design, _ = await load_design(db, design_id, user, request, "owner")
    design.deleted_at = None
    await db.commit()
    return design_out(design, "owner")


@router.post("/designs/{design_id}/duplicate")
async def duplicate_design(design_id: str, request: Request, user: User = Depends(current_user),
                           db: AsyncSession = Depends(get_db)):
    design, _ = await load_design(db, design_id, user, request, "view")
    state = await hub.state(design_id)
    copy = await new_design(db, user, f"{design.title} (copy)", state)
    copy.thumbnail = design.thumbnail
    await db.commit()
    return design_out(copy, "owner")


@router.get("/designs/{design_id}/fonts")
async def design_fonts(design_id: str, request: Request, user: User | None = Depends(optional_user),
                       db: AsyncSession = Depends(get_db)):
    """The owner's uploaded fonts, so people opening a shared design see it as it was made."""
    from .library import font_out

    design, _ = await load_design(db, design_id, user, request)
    if not design.owner_id:
        return {"fonts": []}
    rows = (await db.execute(select(Font).where(Font.owner_id == design.owner_id))).scalars().all()
    return {"fonts": [font_out(f) for f in rows]}


@router.get("/designs/{design_id}/state")
async def get_state(design_id: str, request: Request, user: User | None = Depends(optional_user),
                    db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request)
    return Response(await hub.state(design_id), media_type="application/octet-stream")


@router.post("/designs/{design_id}/state")
async def post_update(design_id: str, request: Request, user: User | None = Depends(optional_user),
                      db: AsyncSession = Depends(get_db)):
    """Fallback for editors that can't hold a websocket open."""
    await load_design(db, design_id, user, request, "edit")
    body = await request.body()
    if not body or len(body) > MAX_STATE:
        raise HTTPException(400, "Bad update")
    room = await hub.room(design_id)
    try:
        await room.apply(body, author=user.id if user else None)
    except Exception as e:
        raise HTTPException(400, "Bad update") from e
    return {"ok": True}


def _decode_data_url(value: str) -> bytes:
    _, _, b64 = value.partition(",")
    try:
        return base64.b64decode(b64)
    except binascii.Error:
        return b""


async def _store_thumbnail(db: AsyncSession, design: Design, data: bytes) -> None:
    if not data or len(data) > MAX_THUMB:
        return
    # A new key each time so CDNs and browsers never show a stale preview.
    key = f"thumbs/{design.id}/{new_id()[:10]}.png"
    old = design.thumbnail
    design.thumbnail = await storage.save(key, data, "image/png")
    await db.commit()
    if old and "/thumbs/" in old:
        await storage.remove("thumbs/" + old.split("/thumbs/", 1)[1])


@router.post("/designs/{design_id}/thumbnail")
async def upload_thumbnail(design_id: str, file: UploadFile, request: Request,
                           user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    design, _ = await load_design(db, design_id, user, request, "edit")
    data = await file.read(MAX_THUMB + 1)
    if not data.startswith(b"\x89PNG"):
        raise HTTPException(400, "Thumbnails are PNG")
    await _store_thumbnail(db, design, data)
    return {"thumbnail": design.thumbnail}


# Versions


def version_out(v: DesignVersion) -> dict:
    return {
        "id": v.id,
        "label": v.label,
        "auto": v.auto,
        "created_at": v.created_at.isoformat(),
        "author": v.author.name or v.author.email if v.author else None,
    }


@router.get("/designs/{design_id}/versions")
async def list_versions(design_id: str, request: Request, user: User | None = Depends(optional_user),
                        db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "edit")
    rows = (await db.execute(
        select(DesignVersion).where(DesignVersion.design_id == design_id)
        .order_by(DesignVersion.created_at.desc()).limit(100)
    )).scalars().all()
    return {"versions": [version_out(v) for v in rows]}


@router.post("/designs/{design_id}/versions")
async def save_version(design_id: str, body: VersionIn, request: Request,
                       user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "edit")
    state = await hub.state(design_id)
    v = DesignVersion(design_id=design_id, author_id=user.id if user else None, auto=False,
                      label=body.label.strip() or "Saved version", ystate=state,
                      doc=docmodel.state_to_json(state))
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return version_out(v)


@router.get("/designs/{design_id}/versions/{version_id}")
async def get_version(design_id: str, version_id: str, request: Request,
                      user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "edit")
    v = await db.get(DesignVersion, version_id)
    if v is None or v.design_id != design_id:
        raise HTTPException(404, "Version not found")
    return {**version_out(v), "doc": v.doc}


@router.post("/designs/{design_id}/versions/{version_id}/restore")
async def restore_version(design_id: str, version_id: str, request: Request,
                          user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "edit")
    v = await db.get(DesignVersion, version_id)
    if v is None or v.design_id != design_id:
        raise HTTPException(404, "Version not found")
    # Keep what's there now, so a restore can itself be undone.
    current = await hub.state(design_id)
    db.add(DesignVersion(design_id=design_id, author_id=user.id if user else None, auto=False,
                         label="Before restoring an older version", ystate=current,
                         doc=docmodel.state_to_json(current)))
    await db.commit()
    await hub.replace(design_id, v.ystate, author=user.id if user else None)
    return {"ok": True}


# Templates


@router.get("/templates")
async def list_templates(category: str = "", q: str = "", db: AsyncSession = Depends(get_db)):
    stmt = select(Design).where(Design.is_template.is_(True), Design.deleted_at.is_(None))
    if category:
        stmt = stmt.where(Design.template_category == category)
    if q:
        stmt = stmt.where(or_(Design.title.ilike(f"%{q}%"), Design.template_category.ilike(f"%{q}%")))
    rows = (await db.execute(stmt.order_by(Design.template_order, Design.title))).scalars().all()
    cats = sorted({d.template_category for d in rows if d.template_category})
    return {"templates": [design_out(d) for d in rows], "categories": cats}


@router.put("/designs/{design_id}/template")
async def set_template(design_id: str, body: TemplateIn, _: User = Depends(admin_user),
                       db: AsyncSession = Depends(get_db)):
    design = await db.get(Design, design_id)
    if design is None:
        raise HTTPException(404, "Design not found")
    design.is_template = body.is_template
    # seeded categories are lowercase and shown capitalized; "Social" and "social" are one chip
    design.template_category = body.category.strip().lower()
    design.template_order = body.order
    await db.commit()
    return design_out(design)

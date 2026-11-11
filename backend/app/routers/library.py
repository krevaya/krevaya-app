"""Brand kits, fonts, stock photo and sound search, admin-added elements."""

import io

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import storage
from ..config import get_settings
from ..content.fonts import BY_FAMILY
from ..db import get_db
from ..deps import current_user
from ..models import BrandKit, Font, LibraryElement, User, new_id

router = APIRouter(prefix="/api", tags=["library"])
settings = get_settings()


class BrandIn(BaseModel):
    name: str = Field(default="My brand", max_length=120)
    colors: list[str] = Field(default_factory=list, max_length=60)
    fonts: dict = Field(default_factory=dict)
    logos: list[dict] = Field(default_factory=list, max_length=40)


def brand_out(b: BrandKit) -> dict:
    return {"id": b.id, "name": b.name, "colors": b.colors, "fonts": b.fonts, "logos": b.logos}


@router.get("/brand-kits")
async def list_brands(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BrandKit).where(BrandKit.owner_id == user.id)
                             .order_by(BrandKit.created_at))).scalars().all()
    return {"kits": [brand_out(b) for b in rows]}


@router.post("/brand-kits")
async def create_brand(body: BrandIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    kit = BrandKit(owner_id=user.id, **body.model_dump())
    db.add(kit)
    await db.commit()
    return brand_out(kit)


@router.put("/brand-kits/{kit_id}")
async def update_brand(kit_id: str, body: BrandIn, user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    kit = await db.get(BrandKit, kit_id)
    if kit is None or kit.owner_id != user.id:
        raise HTTPException(404, "Brand kit not found")
    for k, v in body.model_dump().items():
        setattr(kit, k, v)
    await db.commit()
    return brand_out(kit)


@router.delete("/brand-kits/{kit_id}")
async def delete_brand(kit_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    kit = await db.get(BrandKit, kit_id)
    if kit is None or kit.owner_id != user.id:
        raise HTTPException(404, "Brand kit not found")
    await db.delete(kit)
    await db.commit()
    return {"ok": True}


# Fonts


def font_out(f: Font) -> dict:
    builtin = BY_FAMILY.get(f.family) if f.owner_id is None else None
    return {"id": f.id, "family": f.family, "category": f.category, "files": f.files,
            "custom": f.owner_id is not None, "license": f.license,
            "license_url": storage.url_for(f"fonts/catalog/{builtin.fontsource_id}/LICENSE.txt") if builtin else None}


@router.get("/fonts")
async def list_fonts(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Font).where(or_(Font.owner_id.is_(None), Font.owner_id == user.id)).order_by(Font.family)
    )).scalars().all()
    return {"fonts": [font_out(f) for f in rows]}


@router.get("/fonts/catalog")
async def font_catalog(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Font).where(Font.owner_id.is_(None)).order_by(Font.family))).scalars().all()
    return {"fonts": [font_out(f) for f in rows]}


FONT_TYPES = {"font/ttf": "ttf", "font/otf": "otf", "font/woff": "woff", "font/woff2": "woff2",
              "application/font-woff": "woff", "application/x-font-ttf": "ttf",
              "application/octet-stream": None}
FONT_MAGIC = {b"\x00\x01\x00\x00": "ttf", b"true": "ttf", b"OTTO": "otf", b"wOFF": "woff", b"wOF2": "woff2"}


@router.post("/fonts")
async def upload_font(file: UploadFile, family: str = Form(...), weight: int = Form(400),
                      style: str = Form("normal"), user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    data = await file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "Font files can be up to 8 MB")
    ext = FONT_MAGIC.get(data[:4])
    if ext is None:
        raise HTTPException(400, "Use a TTF, OTF, WOFF or WOFF2 file")
    family = family.strip()[:120] or "My font"
    key = f"fonts/{user.id}/{new_id()}.{ext}"
    url = await storage.save(key, data, f"font/{ext}")
    font = (await db.execute(select(Font).where(Font.owner_id == user.id, Font.family == family))).scalar_one_or_none()
    entry = {"weight": weight, "style": "italic" if style == "italic" else "normal", "url": url}
    if font is None:
        font = Font(owner_id=user.id, family=family, category="custom", license="user", files=[entry])
        db.add(font)
    else:
        font.files = [f for f in font.files if (f["weight"], f["style"]) != (weight, entry["style"])] + [entry]
    await db.commit()
    return font_out(font)


@router.delete("/fonts/{font_id}")
async def delete_font(font_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    font = await db.get(Font, font_id)
    if font is None or font.owner_id != user.id:
        raise HTTPException(404, "Font not found")
    await db.delete(font)
    await db.commit()
    return {"ok": True}


# Stock photos and sounds. Keys stay on the server; the browser only sees results.


@router.get("/stock/config")
async def stock_config():
    return {
        "photos": [p for p, key in (("unsplash", settings.unsplash_key), ("pexels", settings.pexels_key)) if key],
        "sounds": bool(settings.freesound_key),
    }


@router.get("/stock/photos")
async def stock_photos(q: str, page: int = 1, provider: str = "", _: User = Depends(current_user)):
    provider = provider or ("unsplash" if settings.unsplash_key else "pexels" if settings.pexels_key else "")
    async with httpx.AsyncClient(timeout=15) as client:
        if provider == "unsplash" and settings.unsplash_key:
            r = await client.get("https://api.unsplash.com/search/photos",
                                 params={"query": q, "page": page, "per_page": 30},
                                 headers={"Authorization": f"Client-ID {settings.unsplash_key}"})
            r.raise_for_status()
            return {"provider": "unsplash", "photos": [{
                "id": p["id"], "thumb": p["urls"]["small"], "url": p["urls"]["regular"],
                "full": p["urls"]["full"], "width": p["width"], "height": p["height"],
                "author": p["user"]["name"], "link": p["links"]["html"],
                "download": p["links"]["download_location"],
            } for p in r.json()["results"]]}
        if provider == "pexels" and settings.pexels_key:
            r = await client.get("https://api.pexels.com/v1/search",
                                 params={"query": q, "page": page, "per_page": 30},
                                 headers={"Authorization": settings.pexels_key})
            r.raise_for_status()
            return {"provider": "pexels", "photos": [{
                "id": str(p["id"]), "thumb": p["src"]["medium"], "url": p["src"]["large2x"],
                "full": p["src"]["original"], "width": p["width"], "height": p["height"],
                "author": p["photographer"], "link": p["url"], "download": None,
            } for p in r.json()["photos"]]}
    raise HTTPException(404, "Stock photo search is off. An admin can add an Unsplash or Pexels key.")


@router.post("/stock/photos/track")
async def track_unsplash_download(body: dict, _: User = Depends(current_user)):
    # Unsplash asks apps to ping download_location when someone uses a photo.
    url = str(body.get("download") or "")
    if settings.unsplash_key and url.startswith("https://api.unsplash.com/"):
        async with httpx.AsyncClient(timeout=10) as client:
            await client.get(url, headers={"Authorization": f"Client-ID {settings.unsplash_key}"})
    return {"ok": True}


@router.get("/stock/sounds")
async def stock_sounds(q: str, page: int = 1, any_license: bool = False, _: User = Depends(current_user)):
    if not settings.freesound_key:
        raise HTTPException(404, "Sound search is off. An admin can add a Freesound key.")
    filt = "duration:[0 TO 120]" + ("" if any_license else ' license:"Creative Commons 0"')
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get("https://freesound.org/apiv2/search/text/", params={
            "query": q, "page": page, "page_size": 30, "filter": filt, "token": settings.freesound_key,
            "fields": "id,name,duration,license,username,previews,url",
        })
        r.raise_for_status()
    return {"sounds": [{
        "id": s["id"], "name": s["name"], "duration": s["duration"], "license": s["license"],
        "author": s["username"], "link": s["url"], "url": s["previews"]["preview-hq-mp3"],
    } for s in r.json()["results"]]}


@router.get("/stock/proxy")
async def proxy_audio(url: str, _: User = Depends(current_user)):
    """Freesound previews don't send CORS headers, and video export needs the raw audio."""
    from fastapi.responses import StreamingResponse

    if not url.startswith(("https://cdn.freesound.org/", "https://freesound.org/")):
        raise HTTPException(400, "Not a Freesound URL")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
        r.raise_for_status()
    return StreamingResponse(io.BytesIO(r.content), media_type=r.headers.get("content-type", "audio/mpeg"))


# Elements an admin added (illustrations and stickers beyond the built-in set)


@router.get("/elements")
async def library_elements(kind: str = "", q: str = "", db: AsyncSession = Depends(get_db)):
    stmt = select(LibraryElement)
    if kind:
        stmt = stmt.where(LibraryElement.kind == kind)
    if q:
        stmt = stmt.where(or_(LibraryElement.name.ilike(f"%{q}%"), LibraryElement.tags.ilike(f"%{q}%")))
    rows = (await db.execute(stmt.order_by(LibraryElement.name).limit(500))).scalars().all()
    return {"elements": [{"id": e.id, "kind": e.kind, "name": e.name, "tags": e.tags,
                          "svg": e.svg, "url": e.url} for e in rows]}

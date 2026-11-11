import io
import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import storage
from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import Asset, User, new_id
from ..ratelimit import enforce

router = APIRouter(prefix="/api/assets", tags=["assets"])
settings = get_settings()

IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
               "image/svg+xml": "svg"}
AUDIO_TYPES = {"audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
               "audio/webm": "webm", "audio/mp4": "m4a", "audio/aac": "aac"}
VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm"}


def asset_out(a: Asset) -> dict:
    return {
        "id": a.id, "kind": a.kind, "filename": a.filename, "url": storage.url_for(a.key),
        "mime": a.mime, "size": a.size, "width": a.width, "height": a.height,
        "created_at": a.created_at.isoformat(),
    }


def _sniff_svg(data: bytes) -> bool:
    head = data[:1024].lstrip().lower()
    return head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in data[:4096].lower())


def _clean_svg(data: bytes) -> bytes:
    # SVGs are drawn into a canvas as images, where scripts never run, but they can
    # also be opened directly from the media URL. Strip anything active.
    from defusedxml import ElementTree as ET  # noqa: N817

    root = ET.fromstring(data)
    for el in list(root.iter()):
        tag = el.tag.split("}")[-1].lower()
        if tag in {"script", "foreignobject", "iframe", "object", "embed"}:
            for parent in root.iter():
                if el in list(parent):
                    parent.remove(el)
        for attr in list(el.attrib):
            name = attr.split("}")[-1].lower()
            val = el.attrib[attr].strip().lower()
            if name.startswith("on") or (name == "href" and val.startswith(("javascript:", "data:text"))):
                del el.attrib[attr]
    from xml.etree.ElementTree import register_namespace, tostring

    # without these the output comes back as <ns0:svg>, which HTML parsers don't draw
    register_namespace("", "http://www.w3.org/2000/svg")
    register_namespace("xlink", "http://www.w3.org/1999/xlink")
    return tostring(root)


async def store_upload(db: AsyncSession, user: User, data: bytes, filename: str, mime: str) -> Asset:
    if len(data) > settings.upload_limit_mb * 1024 * 1024:
        raise HTTPException(413, f"Files can be up to {settings.upload_limit_mb} MB")
    width = height = None
    if mime in IMAGE_TYPES or _sniff_svg(data):
        if _sniff_svg(data):
            mime, ext, kind = "image/svg+xml", "svg", "image"
            try:
                data = _clean_svg(data)
            except Exception as e:
                raise HTTPException(400, "That SVG couldn't be read") from e
        else:
            try:
                with Image.open(io.BytesIO(data)) as im:
                    width, height = im.size
                    real = Image.MIME.get(im.format or "", mime)
            except (UnidentifiedImageError, OSError) as e:
                raise HTTPException(400, "That file isn't an image we can read") from e
            if real not in IMAGE_TYPES:
                raise HTTPException(400, "Use PNG, JPG, WebP, GIF or SVG")
            mime, ext, kind = real, IMAGE_TYPES[real], "image"
    elif mime in AUDIO_TYPES:
        ext, kind = AUDIO_TYPES[mime], "audio"
    elif mime in VIDEO_TYPES:
        ext, kind = VIDEO_TYPES[mime], "video"
    else:
        raise HTTPException(400, "That file type isn't supported")
    key = f"uploads/{user.id}/{new_id()}.{ext}"
    await storage.save(key, data, mime)
    asset = Asset(owner_id=user.id, kind=kind, filename=filename[:255], key=key, mime=mime,
                  size=len(data), width=width, height=height)
    db.add(asset)
    await db.commit()
    return asset


@router.get("")
async def list_assets(kind: str = "image", user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Asset).where(Asset.owner_id == user.id, Asset.kind == kind)
        .order_by(Asset.created_at.desc()).limit(500)
    )).scalars().all()
    return {"assets": [asset_out(a) for a in rows]}


@router.post("")
async def upload(file: UploadFile, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await enforce(f"upload:{user.id}", settings.rate_limit_upload)
    data = await file.read(settings.upload_limit_mb * 1024 * 1024 + 1)
    asset = await store_upload(db, user, data, file.filename or "upload", file.content_type or "")
    return asset_out(asset)


class FromUrlIn(BaseModel):
    url: str


def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


async def fetch_remote_image(url: str) -> tuple[bytes, str]:
    """Download a public https image. Refuses private addresses and big files."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or not _public_host(parsed.hostname):
        raise HTTPException(400, "Only public https image URLs are allowed")
    limit = settings.upload_limit_mb * 1024 * 1024
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        async with client.stream("GET", url, headers={"user-agent": "krevaya-app"}) as r:
            if r.status_code != 200:
                raise HTTPException(400, f"Couldn't download that image ({r.status_code})")
            chunks, size = [], 0
            async for chunk in r.aiter_bytes():
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, "That image is too big")
                chunks.append(chunk)
            return b"".join(chunks), r.headers.get("content-type", "").split(";")[0]


@router.post("/from-url")
async def upload_from_url(body: FromUrlIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not settings.remote_images:
        raise HTTPException(403, "Adding photos from links is off here. An admin can allow it with REMOTE_IMAGES.")
    await enforce(f"upload:{user.id}", settings.rate_limit_upload)
    data, mime = await fetch_remote_image(body.url)
    name = urlparse(body.url).path.rsplit("/", 1)[-1] or "image"
    return asset_out(await store_upload(db, user, data, name, mime))


@router.delete("/{asset_id}")
async def delete_asset(asset_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    asset = await db.get(Asset, asset_id)
    if asset is None or asset.owner_id != user.id:
        raise HTTPException(404, "Not found")
    await storage.remove(asset.key)
    await db.delete(asset)
    await db.commit()
    return {"ok": True}

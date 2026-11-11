"""Copies of a design with some of its slots swapped out. Shared by the REST API and MCP.

A slot is an element with a `slot` name (older documents used `key`). Text slots take
text, photo slots an https link that we download into the person's uploads, QR slots
the link to encode. The editor re-measures text heights the next time a copy opens.
"""

import copy
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from . import docmodel, ratelimit, storage
from .config import get_settings
from .hub import hub
from .models import Asset, Design, User

MAX_SLOTS = 200
MAX_TEXT = 10_000


class SlotError(Exception):
    """A value we can't put in a slot; the message is shown to the person."""


@dataclass
class CopyRun:
    """One request's worth of copies. Remembers fetched photos so a link is only downloaded once."""

    user: User
    images: dict[str, Asset | Exception] = field(default_factory=dict)


def can_copy(design: Design, role: str | None) -> bool:
    return role in ("edit", "owner") or design.is_template


def slot_of(el: dict[str, Any]) -> str | None:
    return el.get("slot") or el.get("key") or None


def list_slots(data: dict[str, Any]) -> list[dict[str, str]]:
    """Each slot name once, in page order, with what kind of value it takes."""
    found: dict[str, str] = {}
    for page in data.get("pages") or []:
        for el in page.get("elements") or []:
            name = slot_of(el)
            if not name or name in found:
                continue
            found[name] = "qr" if el.get("type") == "svg" and el.get("kind") == "qr" else el.get("type", "")
    return [{"name": n, "type": t} for n, t in found.items()]


def _own_media(url: str) -> bool:
    base = storage.url_for("")
    return bool(base) and url.startswith(base) and ".." not in url


async def fetch_photo(db: AsyncSession, run: CopyRun, url: str) -> Asset | str:
    """An uploaded copy of `url`, or the URL itself if it already points at our storage."""
    if _own_media(url):
        return url
    settings = get_settings()
    if not settings.remote_images:
        raise SlotError("Photos from links are switched off here. Ask your admin to set REMOTE_IMAGES=true.")
    if not url.startswith("https://"):
        raise SlotError("Photo links need to start with https://")
    cached = run.images.get(url)
    if isinstance(cached, Exception):
        raise SlotError(str(cached))
    if cached is not None:
        return cached
    from .routers.assets import fetch_remote_image, store_upload

    if not await ratelimit.hit(f"remote-image:{run.user.id}", settings.rate_limit_remote_images):
        raise SlotError("That's a lot of photo links at once. Give it a minute and try again.")
    try:
        data, mime = await fetch_remote_image(url)
        name = url.split("?", 1)[0].rsplit("/", 1)[-1][:120] or "image"
        asset = await store_upload(db, run.user, data, name, mime)
    except HTTPException as e:
        err = SlotError(f"{url}: {e.detail}")
        run.images[url] = err
        raise err from e
    if asset.kind != "image":
        err = SlotError(f"{url} isn't a photo")
        run.images[url] = err
        raise err
    run.images[url] = asset
    return asset


def _cover_crop(el_w: float, el_h: float, nw: int, nh: int) -> dict[str, float]:
    if el_w <= 0 or el_h <= 0 or nw <= 0 or nh <= 0:
        return {"x": 0, "y": 0, "width": nw, "height": nh}
    target = el_w / el_h
    if nw / nh > target:
        w = nh * target
        return {"x": (nw - w) / 2, "y": 0, "width": w, "height": nh}
    h = nw / target
    return {"x": 0, "y": (nh - h) / 2, "width": nw, "height": h}


def put_photo(el: dict[str, Any], img: Asset | str) -> None:
    el.pop("placeholder", None)
    el.pop("crop", None)
    if isinstance(img, str):
        el["src"] = img
        el.pop("assetId", None)
        return
    el["src"] = storage.url_for(img.key)
    el["assetId"] = img.id
    if img.width and img.height:
        el["naturalWidth"], el["naturalHeight"] = img.width, img.height
        el["crop"] = _cover_crop(float(el.get("width", 0)), float(el.get("height", 0)), img.width, img.height)
    else:
        # svg: no pixel size, so just let it fill the frame
        el["naturalWidth"], el["naturalHeight"] = el.get("width", 100), el.get("height", 100)


def _qr_svg(value: str, fg: str, bg: str, level: str) -> str | None:
    try:
        import segno  # optional
    except ImportError:
        return None
    qr = segno.make(value, error=level.lower(), micro=False)
    return qr.svg_inline(dark=fg, light=bg, border=2, scale=10)


def _set_qr(el: dict[str, Any], value: str) -> None:
    qr = dict(el.get("qr") or {"fg": "#000000", "bg": "#ffffff", "level": "M"})
    qr["value"] = value
    el["qr"] = qr
    svg = _qr_svg(value, qr.get("fg", "#000000"), qr.get("bg", "#ffffff"), qr.get("level", "M"))
    if svg:
        el["svg"] = svg


def _text(value: Any) -> str:
    if isinstance(value, bool | int | float):
        return str(value)
    if not isinstance(value, str):
        raise SlotError("Slot values are text, a number or a photo link")
    if len(value) > MAX_TEXT:
        raise SlotError(f"Keep text under {MAX_TEXT} characters")
    return value


async def put_values(db: AsyncSession, run: CopyRun, data: dict[str, Any],
                     values: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """A copy of `data` with the values dropped into their slots, and how many elements took one."""
    if len(values) > MAX_SLOTS:
        raise SlotError(f"Up to {MAX_SLOTS} slots per copy")
    out = copy.deepcopy(data)
    touched = 0
    for el in (el for page in out.get("pages") or [] for el in page.get("elements") or []):
        name = slot_of(el)
        if name is None or values.get(name) is None:
            continue
        value = _text(values[name])
        if el.get("type") == "text":
            el["text"] = value
        elif el.get("type") == "image":
            put_photo(el, await fetch_photo(db, run, value.strip()))
        elif el.get("type") == "svg" and el.get("kind") == "qr":
            _set_qr(el, value)
        else:
            continue
        touched += 1
    return out, touched


async def source_doc(design: Design) -> dict[str, Any]:
    return docmodel.state_to_json(await hub.state(design.id))


async def make_copy(db: AsyncSession, run: CopyRun, source: Design, values: dict[str, Any],
                    title: str | None = None, data: dict[str, Any] | None = None) -> Design:
    from .routers.designs import new_design

    if data is None:
        data = await source_doc(source)
    filled, _ = await put_values(db, run, data, values)
    title = (title or "").strip()[:200] or source.title
    return await new_design(db, run.user, title, docmodel.from_json(filled))


async def make_copies(db: AsyncSession, run: CopyRun, source: Design, rows: list[dict[str, Any]],
                      title_from: str | None = None, title: str | None = None) -> dict[str, list]:
    """One copy per row. A row that can't be used goes into `failed`; the others still get made."""
    settings = get_settings()
    if len(rows) > settings.copies_per_request:
        raise SlotError(f"Up to {settings.copies_per_request} rows per request")
    data = await source_doc(source)
    made, failed = [], []
    for n, row in enumerate(rows):
        try:
            if not isinstance(row, dict):
                raise SlotError("Each row is an object of slot names and values")
            if not await ratelimit.hit(f"copies:{run.user.id}", settings.rate_limit_copies):
                raise SlotError("That's a lot of copies at once. Give it a minute and try again.")
            name = str(row.get(title_from) or "") if title_from else ""
            if not name:
                name = title or (f"{source.title} {n + 1}" if len(rows) > 1 else source.title)
            d = await make_copy(db, run, source, row, name, data)
            made.append({"id": d.id, "title": d.title})
        except SlotError as e:
            failed.append({"row": n, "reason": str(e)})
    return {"made": made, "failed": failed}

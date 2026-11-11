"""Starter templates shipped with the app.

Each file in templates/ is {"title", "category", "order", "doc"} where doc is a
design document (see frontend/src/doc/schema.ts). Seeding matches existing
templates by title, so running it again updates them in place, and built-in
templates whose file is gone get removed.

Images can point at a file in template_images/ with "asset:<file>"; seeding
copies the file into storage and swaps in its URL.
"""

import json
import logging
import mimetypes
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import docmodel, storage
from ..models import Design

log = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent / "templates"
IMAGE_DIR = Path(__file__).parent / "template_images"
ASSET_PREFIX = "asset:"


def load_files() -> list[dict[str, Any]]:
    out = []
    for path in sorted(TEMPLATE_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text("utf-8"))
        except (OSError, ValueError) as e:
            log.warning("skipping template %s: %s", path.name, e)
            continue
        if not isinstance(data.get("doc"), dict) or not data.get("title"):
            log.warning("skipping template %s: needs a title and a doc", path.name)
            continue
        out.append(data)
    return out


async def _store_image(name: str, cache: dict[str, str]) -> str:
    if name in cache:
        return cache[name]
    path = IMAGE_DIR / name
    # plain file names only, nothing outside the folder
    if Path(name).name != name or not path.is_file():
        log.warning("template image %s not found", name)
        return ""
    data = path.read_bytes()
    key = f"templates/{name}"
    try:
        same = await storage.read(key) == data
    except Exception:
        same = False
    if same:
        url = storage.url_for(key)
    else:
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        url = await storage.save(key, data, ctype)
    cache[name] = url
    return url


async def resolve_assets(doc: dict[str, Any], cache: dict[str, str] | None = None) -> dict[str, Any]:
    """Swap "asset:<file>" image sources for stored URLs, in place."""
    cache = {} if cache is None else cache
    for page in doc.get("pages") or []:
        holders = [page.get("background")]
        for el in page.get("elements") or []:
            holders += [el if el.get("type") == "image" else None, el.get("fill")]
        for h in holders:
            src = h.get("src") if isinstance(h, dict) else None
            if isinstance(src, str) and src.startswith(ASSET_PREFIX):
                h["src"] = await _store_image(src[len(ASSET_PREFIX):], cache)
    return doc


async def seed_templates(db: AsyncSession) -> int:
    """Create or update the built-in templates. Returns how many were written."""
    rows = (await db.execute(
        select(Design).where(Design.is_template.is_(True), Design.owner_id.is_(None))
    )).scalars().all()
    by_title = {d.title: d for d in rows}
    written = 0
    current: set[str] = set()
    images: dict[str, str] = {}
    for data in load_files():
        title = str(data["title"])[:200]
        current.add(title)
        state = docmodel.from_json(await resolve_assets(data["doc"], images))
        doc = docmodel.state_to_json(state)
        w, h, n = docmodel.summary(doc)
        category = str(data.get("category") or "")[:60]
        order = int(data.get("order") or 0)
        design = by_title.get(title)
        if design is None:
            design = Design(owner_id=None, title=title, is_template=True)
            db.add(design)
        elif (design.doc == doc and design.template_category == category
              and design.template_order == order and design.deleted_at is None):
            continue
        design.ystate = state
        design.doc = doc
        design.width, design.height, design.page_count = w, h, n
        design.template_category = category
        design.template_order = order
        design.deleted_at = None
        # the old thumbnail shows the old content
        design.thumbnail = ""
        written += 1
    # built-in templates that no longer ship; templates admins make always have an owner
    for design in rows:
        if design.title not in current:
            log.info("removing old template %s", design.title)
            await db.delete(design)
    await db.commit()
    return written

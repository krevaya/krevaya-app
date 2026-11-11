"""The design document, as stored in Yjs.

The browser and the server share this layout:

    pages     Array of Map  {id, name, width, height, background, notes, duration,
                             transition, elements: Array of Map}
    settings  Map           {audio: [...], ...}

Element maps hold plain values; nested objects (crop, shadow, animation...) are
stored whole and replaced whole. frontend/src/doc/schema.ts is the other half of
this file, keep them in step.
"""

import uuid
from collections.abc import Callable
from typing import Any

from pycrdt import Array, Doc, Map


def short_id() -> str:
    return uuid.uuid4().hex[:12]


def _element_map(el: dict[str, Any]) -> Map:
    return Map({k: v for k, v in el.items() if v is not None})


def _page_map(page: dict[str, Any]) -> Map:
    data = {k: v for k, v in page.items() if k != "elements" and v is not None}
    data.setdefault("id", short_id())
    data["elements"] = Array([_element_map({**e, "id": e.get("id") or short_id()})
                              for e in page.get("elements", [])])
    return Map(data)


def new_doc() -> Doc:
    doc = Doc()
    doc.get("pages", type=Array)
    doc.get("settings", type=Map)
    return doc


def load(state: bytes | None) -> Doc:
    doc = new_doc()
    if state:
        doc.apply_update(state)
    return doc


def from_json(data: dict[str, Any]) -> bytes:
    doc = new_doc()
    pages = doc.get("pages", type=Array)
    settings = doc.get("settings", type=Map)
    with doc.transaction():
        for page in data.get("pages", []):
            pages.append(_page_map(page))
        for k, v in (data.get("settings") or {}).items():
            settings[k] = v
    return doc.get_update()


def to_json(doc: Doc) -> dict[str, Any]:
    pages = doc.get("pages", type=Array).to_py() or []
    settings = doc.get("settings", type=Map).to_py() or {}
    return {"pages": pages, "settings": settings}


def state_to_json(state: bytes | None) -> dict[str, Any]:
    return to_json(load(state))


def blank(width: int, height: int, pages: int = 1) -> dict[str, Any]:
    return {
        "pages": [
            {"id": short_id(), "width": width, "height": height,
             "background": {"type": "solid", "color": "#ffffff"}, "elements": []}
            for _ in range(pages)
        ],
        "settings": {},
    }


def edit(state: bytes | None, fn: Callable[[Doc], None]) -> tuple[bytes, bytes]:
    """Run `fn` against the document. Returns (full state, the update fn produced)."""
    doc = load(state)
    before = doc.get_state()
    with doc.transaction():
        fn(doc)
    return doc.get_update(), doc.get_update(before)


def iter_elements(doc: Doc):
    for page in doc.get("pages", type=Array):
        for el in page["elements"]:
            yield page, el


def add_element(doc: Doc, page_index: int, el: dict[str, Any]) -> str:
    pages = doc.get("pages", type=Array)
    page = pages[page_index]
    el = {**el, "id": el.get("id") or short_id()}
    page["elements"].append(_element_map(el))
    return el["id"]


def add_page(doc: Doc, page: dict[str, Any], index: int | None = None) -> str:
    pages = doc.get("pages", type=Array)
    m = _page_map(page)
    if index is None:
        pages.append(m)
    else:
        pages.insert(index, m)
    return str(m["id"])


def summary(data: dict[str, Any]) -> tuple[int, int, int]:
    pages = data.get("pages") or []
    if not pages:
        return 1080, 1080, 0
    return int(pages[0].get("width", 1080)), int(pages[0].get("height", 1080)), len(pages)

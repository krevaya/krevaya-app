"""Assistant tools over MCP, served at /mcp when ASSISTANT_API is on.

Stateless streamable HTTP. Callers send a personal API token (`Bearer ka_...`, made in
account settings); tool calls are counted per token. Changes are applied through the
hub, which pushes them to any open editor straight away.
"""

import contextvars
import json
import logging
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy import or_, select
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from . import docmodel, ratelimit, slots
from .config import get_settings
from .db import SessionLocal, utcnow
from .hub import hub
from .models import ApiToken, Design, User
from .security import sha256

log = logging.getLogger(__name__)
settings = get_settings()

_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("mcp_user_id", default=None)

ELEMENT_SHAPE = """
Element JSON (coordinates are page pixels, origin top-left; rotation in degrees about the top-left corner):
  common: {type, x, y, width, height, rotation=0, opacity=1, name?, slot?, locked?, hidden?, flipX?, flipY?,
           shadow?: {color, blur, x, y, opacity}, link?}
  "slot" marks an element design_copy / design_copies can swap out, e.g. "headline" or "photo".
  text:  {type:"text", text, fontFamily="Inter", fontSize=32, fontWeight=400, color="#16131f",
          align:"left"|"center"|"right"|"justify", lineHeight=1.2, letterSpacing=0, italic?, underline?,
          uppercase?, list?: "none"|"bullet"|"number", role?: "heading"|"subheading"|"body"}
         height is fixed up by the editor when the design is opened, so a rough value is fine.
  shape: {type:"shape", shape:"rect"|"rounded"|"ellipse"|"triangle"|"diamond"|"star"|"heart"|"hexagon"|
          "arrow-right"|"speech"|"blob"|..., fill: Fill, stroke?, strokeWidth?, radius?}
  line:  {type:"line", stroke="#16131f", strokeWidth=4, startHead:"none"|"arrow"|"circle"|...,
          endHead="none", dash?: "solid"|"dashed"|"dotted"}  (x,y is the start, width is the length)
  image: {type:"image", src (https URL, copied into your uploads), naturalWidth?, naturalHeight?, radius?,
          mask?: shape name}
  svg:   {type:"svg", kind:"icon"|"illustration"|"sticker"|"qr", svg: "<svg ...>...</svg>",
          qr?: {value, fg, bg, level}}
Fill: {type:"solid", color:"#hex"} | {type:"linear", angle, stops:[{offset:0..1, color}]} |
      {type:"radial", stops:[...]} | {type:"image", src, fit?: "cover"|"contain"|"tile"}
"""

INSTRUCTIONS = (
    f"{settings.site_name} keeps designs as a list of pages, each holding positioned elements. "
    "Start with design_search (your own work) or starter_list (shared starters), read one with design_read "
    "to get element ids, and change it with the element_* and page_* tools. Starters can't be edited in "
    "place: design_copy makes your own copy and can swap slot values on the way. When you're done, share "
    "the design_link result so the person can open it."
)

mcp = MCPServer(name=settings.site_name, instructions=INSTRUCTIONS)

ELEMENT_TYPES = {"text", "shape", "line", "image", "svg"}
TEXT_DEFAULTS = {"text": "", "fontFamily": "Inter", "fontSize": 32, "fontWeight": 400, "align": "left",
                 "lineHeight": 1.2, "letterSpacing": 0, "color": "#16131f"}
LINE_DEFAULTS = {"stroke": "#16131f", "strokeWidth": 4, "startHead": "none", "endHead": "none"}
MAX_SVG = 500_000
# kept in step with ShapeKind in frontend/src/doc/schema.ts; anything else would draw as a plain rectangle
SHAPES = {"rect", "rounded", "ellipse", "triangle", "right-triangle", "diamond", "pentagon", "hexagon", "octagon",
          "star", "star-6", "burst", "heart", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "chevron",
          "cross", "speech", "cloud", "parallelogram", "trapezoid", "ring", "half-circle", "blob", "arch", "tag"}
SHAPE_ALIASES = {"circle": "ellipse", "oval": "ellipse", "square": "rect", "rectangle": "rect"}


def _shape_name(value: Any) -> str:
    name = SHAPE_ALIASES.get(str(value).lower(), str(value).lower())
    if name not in SHAPES:
        raise ToolError(f"Unknown shape '{value}'. Use one of: {', '.join(sorted(SHAPES))}")
    return name



# auth


class TokenGate:
    """Sits in front of the SDK app: checks the API token and counts tool calls against it."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.inner(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        auth = headers.get("authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        user_id, digest = (await _check_token(token)) if token else (None, "")
        if user_id is None:
            resp = JSONResponse({"error": "Missing or unknown API token (Authorization: Bearer ka_...)"},
                                status_code=401,
                                headers={"WWW-Authenticate": 'Bearer realm="mcp"'})
            await resp(scope, receive, send)
            return
        # only tools/call messages count; handshakes and listings are free
        if scope["method"] == "POST":
            body = await _read_body(receive)
            if body is None:
                await JSONResponse({"error": "Request too large"}, status_code=413)(scope, receive, send)
                return
            calls = _tool_calls(body)
            if calls and not await ratelimit.hit(f"mcp:{digest[:24]}", settings.assistant_rate, cost=calls):
                resp = JSONResponse({"error": "Tool call limit reached for this token. Wait a minute."},
                                    status_code=429, headers={"Retry-After": "60"})
                await resp(scope, receive, send)
                return
            receive = _replay(body)
        reset = _user_id.set(user_id)
        try:
            await self.inner(scope, receive, send)
        finally:
            _user_id.reset(reset)


MAX_BODY = 2 * 1024 * 1024


async def _read_body(receive: Receive) -> bytes | None:
    chunks, size = [], 0
    while True:
        message = await receive()
        chunk = message.get("body", b"")
        size += len(chunk)
        if size > MAX_BODY:
            return None
        chunks.append(chunk)
        if not message.get("more_body"):
            return b"".join(chunks)


def _replay(body: bytes) -> Receive:
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


def _tool_calls(body: bytes) -> int:
    try:
        data = json.loads(body)
    except ValueError:
        return 0
    messages = data if isinstance(data, list) else [data]
    return sum(1 for m in messages if isinstance(m, dict) and m.get("method") == "tools/call")


async def _check_token(raw: str) -> tuple[str | None, str]:
    digest = sha256(raw)
    async with SessionLocal() as db:
        row = (await db.execute(select(ApiToken).where(ApiToken.token_hash == digest))).scalar_one_or_none()
        if row is None or row.revoked_at is not None or not row.user.is_active:
            return None, digest
        row.last_used_at = utcnow()
        await db.commit()
        return row.user_id, digest


def build_app():
    """The ASGI app to route at /mcp. Run `mcp.session_manager.run()` in the app's lifespan."""
    inner = mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        # every request carries a bearer token, which a rebinding page can't add
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    return TokenGate(inner)


# helpers


async def _user(db) -> User:
    uid = _user_id.get()
    user = await db.get(User, uid) if uid else None
    if user is None or not user.is_active:
        raise ToolError("Not signed in")
    return user


async def _design(db, user: User, design_id: str, edit: bool = True) -> Design:
    d = await db.get(Design, design_id)
    if d is None or d.deleted_at is not None:
        raise ToolError("Design not found")
    if d.owner_id == user.id:
        return d
    if d.is_template and not edit:
        return d
    if d.is_template:
        raise ToolError("Starters are read-only. Call design_copy to get an editable copy.")
    raise ToolError("Design not found")


def _url(design_id: str) -> str:
    return f"{settings.site_url.rstrip('/')}/design/{design_id}"


def _brief(d: Design) -> dict:
    return {"id": d.id, "title": d.title, "width": d.width, "height": d.height, "pages": d.page_count,
            "updated_at": d.updated_at.isoformat(), "url": _url(d.id)}


def _json_arg(value: Any, what: str) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as e:
            raise ToolError(f"{what} isn't valid JSON: {e}") from e
    return value


def _num(el: dict, key: str, default: float) -> None:
    v = el.get(key, default)
    if isinstance(v, bool) or not isinstance(v, int | float):
        raise ToolError(f"'{key}' has to be a number")
    el[key] = v


def _check_fill(value: Any, what: str) -> dict:
    if isinstance(value, str):
        return {"type": "solid", "color": value}
    if not isinstance(value, dict) or value.get("type") not in {"solid", "linear", "radial", "image"}:
        raise ToolError(f"{what} has to be a color string or a Fill object")
    return value


async def _element(db, user: User, raw: Any, page: dict | None = None) -> dict:
    el = _json_arg(raw, "element")
    if not isinstance(el, dict):
        raise ToolError("element has to be a JSON object")
    el = dict(el)
    kind = el.get("type")
    if kind not in ELEMENT_TYPES:
        raise ToolError(f"type has to be one of {sorted(ELEMENT_TYPES)}")
    pw, ph = (page or {}).get("width", 1080), (page or {}).get("height", 1080)
    if kind == "text":
        # a narrow default box breaks big headlines mid-word
        el.setdefault("width", round(pw * 0.8))
        if isinstance(el.get("fontSize"), int | float):
            el.setdefault("height", round(el["fontSize"] * 1.2))
    _num(el, "width", round(pw * 0.4))
    _num(el, "height", round(ph * 0.2))
    _num(el, "x", round((pw - el["width"]) / 2))
    _num(el, "y", round((ph - el["height"]) / 2))
    _num(el, "rotation", 0)
    _num(el, "opacity", 1)
    el.pop("id", None)
    if kind == "text":
        el = {**TEXT_DEFAULTS, **el}
        if not isinstance(el["text"], str):
            el["text"] = str(el["text"])
        _num(el, "fontSize", 32)
    elif kind == "shape":
        el["shape"] = _shape_name(el.get("shape", "rect"))
        el["fill"] = _check_fill(el.get("fill", "#2a9d8f"), "fill")
    elif kind == "line":
        el = {**LINE_DEFAULTS, **el}
    elif kind == "image":
        src = el.get("src")
        if not isinstance(src, str) or not src:
            raise ToolError("image elements need a src URL")
        try:
            img = await slots.fetch_photo(db, slots.CopyRun(user), src.strip())
        except slots.SlotError as e:
            raise ToolError(str(e)) from e
        w, h = el["width"], el["height"]
        slots.put_photo(el, img)
        el.setdefault("naturalWidth", w)
        el.setdefault("naturalHeight", h)
    elif kind == "svg":
        svg = el.get("svg")
        if not isinstance(svg, str) or "<svg" not in svg[:2000].lower() or len(svg) > MAX_SVG:
            raise ToolError("svg elements need an svg string (under 500 KB)")
        if any(bad in svg.lower() for bad in ("<script", "javascript:", "<foreignobject")):
            raise ToolError("That SVG has scripts in it")
        el.setdefault("kind", "illustration")
    return el


def _find(doc, element_id: str):
    for page in doc.get("pages", type=docmodel.Array):
        elements = page["elements"]
        for i, el in enumerate(elements):
            if el.get("id") == element_id:
                return elements, i, el
    raise ToolError(f"No element with id {element_id}")


def _summary_value(v: Any) -> Any:
    if isinstance(v, str) and len(v) > 400:
        return v[:200] + f"... ({len(v)} characters)"
    return v


async def _edit(design_id: str, fn, user: User) -> dict:
    try:
        return await hub.edit(design_id, fn, author=user.id)
    except ToolError:
        raise
    except (IndexError, KeyError) as e:
        raise ToolError(f"That didn't work: {e}") from e


# tools


@mcp.tool()
async def design_search(query: str = "", limit: int = 50) -> dict:
    """Find designs you own by title. An empty `query` returns all of them, latest edits on top."""
    async with SessionLocal() as db:
        user = await _user(db)
        stmt = select(Design).where(Design.owner_id == user.id, Design.deleted_at.is_(None))
        if query:
            stmt = stmt.where(Design.title.ilike(f"%{query}%"))
        rows = (await db.execute(stmt.order_by(Design.updated_at.desc()).limit(max(1, min(limit, 200))))).scalars()
        return {"designs": [_brief(d) for d in rows]}


@mcp.tool()
async def design_read(design_id: str) -> dict:
    """Pages and elements of one of your designs or a starter, with the element ids the edit tools need.

    SVG markup and other long strings are trimmed in the reply.
    """
    async with SessionLocal() as db:
        user = await _user(db)
        d = await _design(db, user, design_id, edit=False)
        data = docmodel.state_to_json(await hub.state(d.id))
    pages = []
    for i, page in enumerate(data["pages"]):
        pages.append({
            "index": i, "id": page.get("id"), "name": page.get("name"), "width": page.get("width"),
            "height": page.get("height"), "background": page.get("background"),
            "elements": [{k: _summary_value(v) for k, v in el.items()} for el in page.get("elements", [])],
        })
    return {**_brief(d), "is_template": d.is_template, "slots": slots.list_slots(data), "pages": pages}


@mcp.tool(description=f"""Create a design and get back its id plus an editor link.

Without `pages` you get one blank white page of width x height; otherwise pass a JSON list of
{{width?, height?, name?, background?: Fill, elements?: [Element]}}.
{ELEMENT_SHAPE}""")
async def design_new(title: str = "Untitled design", width: int = 1080, height: int = 1080,
                        pages: list[dict[str, Any]] | str | None = None) -> dict:
    from .routers.designs import new_design

    if not (16 <= width <= 8000 and 16 <= height <= 8000):
        raise ToolError("width and height have to be between 16 and 8000")
    async with SessionLocal() as db:
        user = await _user(db)
        if pages is None:
            data = docmodel.blank(width, height)
        else:
            raw_pages = _json_arg(pages, "pages")
            if not isinstance(raw_pages, list) or not raw_pages or len(raw_pages) > 100:
                raise ToolError("pages has to be a list of 1 to 100 pages")
            out = []
            for p in raw_pages:
                if not isinstance(p, dict):
                    raise ToolError("each page has to be an object")
                page = {"width": int(p.get("width") or width), "height": int(p.get("height") or height),
                        "background": _check_fill(p.get("background", "#ffffff"), "background")}
                if p.get("name"):
                    page["name"] = str(p["name"])[:120]
                page["elements"] = [await _element(db, user, e, page) for e in p.get("elements") or []]
                out.append(page)
            data = {"pages": out, "settings": {}}
        d = await new_design(db, user, title.strip()[:200], docmodel.from_json(data))
        return _brief(d)


@mcp.tool(description=f"""Drop an element onto page `page_index` (the first page is 0) and get back its new id.
{ELEMENT_SHAPE}""")
async def element_add(design_id: str, page_index: int, element: dict[str, Any] | str) -> dict:
    async with SessionLocal() as db:
        user = await _user(db)
        d = await _design(db, user, design_id)
        data = docmodel.state_to_json(await hub.state(d.id))
        if not 0 <= page_index < len(data["pages"]):
            raise ToolError(f"page_index has to be between 0 and {len(data['pages']) - 1}")
        el = await _element(db, user, element, data["pages"][page_index])
    el["id"] = docmodel.short_id()
    await _edit(design_id, lambda doc: docmodel.add_element(doc, page_index, el), user)
    return {"id": el["id"]}


@mcp.tool()
async def element_edit(design_id: str, element_id: str, patch: dict[str, Any] | str) -> dict:
    """Change some properties of an element, e.g. `patch` {"text": "Hello"} or {"x": 40, "y": 80}.

    Setting a key to null drops it, and `id` and `type` can't change. fill, shadow, crop and qr get
    replaced whole rather than merged. When an image's `src` becomes a new https link, the file is
    fetched into your uploads.
    """
    body = _json_arg(patch, "patch")
    if not isinstance(body, dict) or not body:
        raise ToolError("patch has to be a non-empty JSON object")
    body = {k: v for k, v in body.items() if k not in ("id", "type")}
    if body.get("shape") is not None:
        body["shape"] = _shape_name(body["shape"])
    for k in ("x", "y", "width", "height", "rotation", "opacity", "fontSize"):
        if k in body and body[k] is not None and (isinstance(body[k], bool) or not isinstance(body[k], int | float)):
            raise ToolError(f"'{k}' has to be a number")
    async with SessionLocal() as db:
        user = await _user(db)
        await _design(db, user, design_id)
        if isinstance(body.get("src"), str):
            try:
                img = await slots.fetch_photo(db, slots.CopyRun(user), body["src"].strip())
            except slots.SlotError as e:
                raise ToolError(str(e)) from e
            tmp: dict[str, Any] = {}
            slots.put_photo(tmp, img)
            body = {**body, **tmp}

    def apply(doc):
        _, _, el = _find(doc, element_id)
        for k, v in body.items():
            if v is None:
                if k in el:
                    del el[k]
            else:
                el[k] = v

    await _edit(design_id, apply, user)
    return {"ok": True}


@mcp.tool()
async def element_remove(design_id: str, element_id: str) -> dict:
    """Delete one element from a design."""
    async with SessionLocal() as db:
        user = await _user(db)
        await _design(db, user, design_id)

    def apply(doc):
        elements, i, _ = _find(doc, element_id)
        del elements[i]

    await _edit(design_id, apply, user)
    return {"ok": True}


@mcp.tool()
async def page_add(design_id: str, width: int | None = None, height: int | None = None,
                   background: dict[str, Any] | str = "#ffffff", index: int | None = None,
                   name: str = "") -> dict:
    """Add a blank page at the end, or at `index` (0 means before the first page). It takes the first
    page's size unless width and height are passed. `background` is a hex color or a Fill object."""
    bg = _check_fill(_json_arg(background, "background") if isinstance(background, str)
                     and background.startswith("{") else background, "background")
    async with SessionLocal() as db:
        user = await _user(db)
        d = await _design(db, user, design_id)
    page = {"width": width or d.width, "height": height or d.height, "background": bg, "elements": []}
    if not (16 <= page["width"] <= 8000 and 16 <= page["height"] <= 8000):
        raise ToolError("width and height have to be between 16 and 8000")
    if name:
        page["name"] = name[:120]
    page["id"] = docmodel.short_id()

    def apply(doc):
        pages = doc.get("pages", type=docmodel.Array)
        docmodel.add_page(doc, page, None if index is None else max(0, min(index, len(pages))))

    data = await _edit(design_id, apply, user)
    return {"id": page["id"], "index": next(i for i, p in enumerate(data["pages"]) if p["id"] == page["id"])}


@mcp.tool()
async def page_background(design_id: str, page_index: int, background: dict[str, Any] | str) -> dict:
    """Set one page's background to a hex color, a gradient
    ({type:"linear", angle:90, stops:[{offset:0,color:"#..."},{offset:1,color:"#..."}]}) or an image fill."""
    bg = _check_fill(_json_arg(background, "background") if isinstance(background, str)
                     and background.startswith("{") else background, "background")
    async with SessionLocal() as db:
        user = await _user(db)
        await _design(db, user, design_id)

    def apply(doc):
        pages = doc.get("pages", type=docmodel.Array)
        if not 0 <= page_index < len(pages):
            raise ToolError(f"page_index has to be between 0 and {len(pages) - 1}")
        pages[page_index]["background"] = bg

    await _edit(design_id, apply, user)
    return {"ok": True}


@mcp.tool()
async def starter_list(category: str = "", query: str = "") -> dict:
    """Starter designs anyone can use, each listed with its slots. Use design_copy to get one of your own."""
    async with SessionLocal() as db:
        await _user(db)
        stmt = select(Design).where(Design.is_template.is_(True), Design.deleted_at.is_(None))
        if category:
            stmt = stmt.where(Design.template_category == category)
        if query:
            stmt = stmt.where(or_(Design.title.ilike(f"%{query}%"), Design.template_category.ilike(f"%{query}%")))
        rows = (await db.execute(stmt.order_by(Design.template_order, Design.title).limit(500))).scalars().all()
        return {"starters": [{**_brief(d), "category": d.template_category,
                              "slots": slots.list_slots(d.doc or {})} for d in rows]}


@mcp.tool()
async def design_copy(design_id: str, values: dict[str, Any] | str, title: str = "") -> dict:
    """Copy a design or starter into your account, filling in slots along the way.

    `values` maps slot names to values: plain text for text slots, an https image URL for photo slots,
    the target URL for QR slots. Slot names show up in design_read and starter_list. Pass {} for a
    straight copy.
    """
    vals = _json_arg(values, "values")
    if not isinstance(vals, dict):
        raise ToolError("values has to be a JSON object")
    async with SessionLocal() as db:
        user = await _user(db)
        source = await _design(db, user, design_id, edit=False)
        if not await ratelimit.hit(f"copies:{user.id}", settings.rate_limit_copies):
            raise ToolError("Copy limit reached for now. Wait a minute.")
        try:
            d = await slots.make_copy(db, slots.CopyRun(user), source, vals, title or None)
        except slots.SlotError as e:
            raise ToolError(str(e)) from e
        return _brief(d)


@mcp.tool()
async def design_copies(design_id: str, rows: list[dict[str, Any]] | str, title_from: str = "") -> dict:
    """Batch form of design_copy: `rows` is a list with one {slot name: value} object per copy.

    With `title_from`, each copy is titled from that slot's value. Rows that can't be used are
    returned in `failed` with the reason; the rest are made anyway and returned in `made`.
    """
    data = _json_arg(rows, "rows")
    if not isinstance(data, list) or not data:
        raise ToolError("rows has to be a non-empty list of objects")
    async with SessionLocal() as db:
        user = await _user(db)
        source = await _design(db, user, design_id, edit=False)
        try:
            out = await slots.make_copies(db, slots.CopyRun(user), source, data, title_from or None)
        except slots.SlotError as e:
            raise ToolError(str(e)) from e
    for d in out["made"]:
        d["url"] = _url(d["id"])
    return out


@mcp.tool()
async def design_retitle(design_id: str, title: str) -> dict:
    """Rename a design you own."""
    async with SessionLocal() as db:
        user = await _user(db)
        d = await _design(db, user, design_id)
        d.title = title.strip()[:200] or "Untitled design"
        await db.commit()
        return _brief(d)


@mcp.tool()
async def design_link(design_id: str) -> dict:
    """The URL that opens a design in the editor, for giving back to the person."""
    async with SessionLocal() as db:
        user = await _user(db)
        d = await _design(db, user, design_id, edit=False)
    return {"url": _url(d.id)}

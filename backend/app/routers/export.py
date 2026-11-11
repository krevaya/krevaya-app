"""Server-side export with a headless browser. Off unless HEADLESS_EXPORT=true.

Needs `pip install playwright && playwright install chromium` (or HEADLESS_BROWSER_PATH)
and a frontend page at /snapshot/<id> that:

  - reads `token` from the query string and sends it as `x-snapshot-token` (or `?snapshot=`)
    on its API and websocket calls, which grants view access for five minutes
  - draws page `page` (or every page, for pdf) at `scale`, each in an element with
    `data-snapshot-page="<index>"` sized to the page
  - sets `window.snapshotReady = true` once images and fonts have loaded

Most people export in the browser; this is for scripts and the API.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..access import load_design, snapshot_token
from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import User
from ..ratelimit import enforce

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/designs", tags=["export"])
settings = get_settings()

TYPES = {"png": "image/png", "jpg": "image/jpeg", "pdf": "application/pdf"}
READY_TIMEOUT_MS = 30_000
_browser_lock = asyncio.Semaphore(2)


class ExportIn(BaseModel):
    format: str = Field(default="png", pattern="^(png|jpg|pdf)$")
    page: int = Field(default=0, ge=0)
    scale: float = Field(default=1, gt=0, le=4)


class SnapshotPageMissing(Exception):
    pass


async def _snapshot(design_id: str, body: ExportIn, width: int, height: int) -> bytes:
    from playwright.async_api import Error as PlaywrightError
    from playwright.async_api import TimeoutError as PlaywrightTimeout
    from playwright.async_api import async_playwright

    base = (settings.snapshot_url or settings.site_url).rstrip("/")
    url = f"{base}/snapshot/{design_id}?token={snapshot_token(design_id)}&page={body.page}&scale={body.scale}"
    if body.format == "pdf":
        url += "&all=1"
    launch = {"executable_path": settings.headless_browser_path} if settings.headless_browser_path else {}
    async with _browser_lock, async_playwright() as p:
        browser = await p.chromium.launch(**launch)
        try:
            page = await browser.new_page(device_scale_factor=1)
            try:
                resp = await page.goto(url, wait_until="domcontentloaded")
            except PlaywrightError as e:
                raise SnapshotPageMissing from e
            if resp is None or resp.status == 404:
                raise SnapshotPageMissing
            try:
                await page.wait_for_function("window.snapshotReady === true", timeout=READY_TIMEOUT_MS)
            except PlaywrightTimeout as e:
                raise SnapshotPageMissing from e
            if body.format == "pdf":
                return await page.pdf(width=f"{width}px", height=f"{height}px", print_background=True,
                                      margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
            target = page.locator(f'[data-snapshot-page="{body.page}"]')
            if await target.count() == 0:
                raise HTTPException(400, "That page doesn't exist")
            if body.format == "jpg":
                return await target.screenshot(type="jpeg", quality=92)
            return await target.screenshot(type="png", omit_background=False)
        finally:
            await browser.close()


@router.post("/{design_id}/export")
async def export_design(design_id: str, body: ExportIn, request: Request, user: User = Depends(current_user),
                        db=Depends(get_db)):
    if not settings.headless_export:
        raise HTTPException(501, "Headless export is off. Set HEADLESS_EXPORT=true to use it.")
    design, _ = await load_design(db, design_id, user, request, "view")
    if body.page >= max(design.page_count, 1):
        raise HTTPException(400, "That page doesn't exist")
    await enforce(f"export:{user.id}", settings.rate_limit_export)
    try:
        import playwright  # noqa: F401
    except ImportError as e:
        raise HTTPException(501, "Server-side export needs Playwright: pip install playwright, then "
                                 "playwright install chromium") from e
    try:
        data = await _snapshot(design.id, body, design.width, design.height)
    except SnapshotPageMissing as e:
        raise HTTPException(501, "Server-side export needs the frontend's /snapshot page, which didn't load or "
                                 "never signaled it was ready") from e
    except HTTPException:
        raise
    except Exception as e:
        log.exception("export of %s failed", design_id)
        raise HTTPException(502, "The export browser failed. Check the server log.") from e
    name = "".join(c if (c.isascii() and c.isalnum()) or c in " -_" else "_" for c in design.title).strip() or "design"
    return Response(data, media_type=TYPES[body.format],
                    headers={"Content-Disposition": f'attachment; filename="{name}.{body.format}"'})

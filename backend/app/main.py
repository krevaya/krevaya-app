import asyncio
import logging
from contextlib import AsyncExitStack, asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Route

from . import storage
from .config import get_settings
from .hub import hub
from .routers import assets, auth, copies, designs, export, library, oauth, realtime, sharing, tokens

settings = get_settings()
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    reaper = asyncio.create_task(hub.reaper())
    async with AsyncExitStack() as stack:
        if settings.assistant_api:
            from .mcp_server import mcp

            await stack.enter_async_context(mcp.session_manager.run())
        yield
    reaper.cancel()
    await hub.flush_all()


def create_app() -> FastAPI:
    if settings.secret_key == "dev-only-change-me" and not settings.is_sqlite:
        logging.getLogger(__name__).warning("SECRET_KEY is still the default. Set it in .env before going live.")
    app = FastAPI(title=settings.site_name, lifespan=lifespan, docs_url="/api/docs",
                  openapi_url="/api/openapi.json", redoc_url=None)

    @app.middleware("http")
    async def same_origin_only(request: Request, call_next):
        # Cookie sessions plus SameSite=Lax cover most of CSRF; this closes the rest.
        # API-token requests don't carry cookies, so they're exempt.
        if request.method in UNSAFE and "authorization" not in request.headers:
            origin = request.headers.get("origin")
            if origin:
                allowed = {urlparse(settings.site_url).netloc, request.headers.get("host", "")}
                if urlparse(origin).netloc not in allowed:
                    return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)
        return await call_next(request)

    for r in (auth, oauth, tokens, designs, copies, export, assets, sharing, library, realtime):
        app.include_router(r.router)

    if settings.assistant_api:
        from .mcp_server import build_app

        # a plain route rather than a mount, so /mcp works without a trailing slash
        app.router.routes.append(Route("/mcp", build_app(), methods=["GET", "POST", "DELETE"]))

    from .admin import mount as mount_admin

    mount_admin(app)

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    @app.get("/api/config")
    async def public_config():
        return {
            "site_name": settings.site_name,
            "signup": settings.allow_signup,
            "assistant_api": settings.assistant_api,
            "headless_export": settings.headless_export,
            "upload_limit_mb": settings.upload_limit_mb,
            "copies_per_request": settings.copies_per_request,
        }

    if not settings.s3_bucket:
        storage.media_root().mkdir(parents=True, exist_ok=True)
        app.mount("/media", StaticFiles(directory=storage.media_root()), name="media")

    return app


app = create_app()

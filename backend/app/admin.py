"""Admin site at /admin (sqladmin). Only accounts with is_admin can get in.

An admin who is already signed in to the app goes straight through; otherwise
the admin login form takes the same email and password.
"""

from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request
from wtforms import TextAreaField

from . import storage
from .config import get_settings
from .db import SessionLocal, engine
from .deps import _from_cookie
from .models import Asset, Design, Font, LibraryElement, ShareLink, User
from .ratelimit import client_ip, hit
from .security import verify_password

settings = get_settings()


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        if not await hit(f"admin-login:{client_ip(request)}", settings.rate_limit_login):
            return False
        form = await request.form()
        email = str(form.get("username", "")).strip().lower()
        password = str(form.get("password", ""))
        async with SessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None or not user.is_admin or not user.is_active or not verify_password(password, user.password_hash):
            return False
        request.session.clear()
        request.session["user_id"] = user.id
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        async with SessionLocal() as db:
            user = await _from_cookie(request, db)
            if user is None and request.session.get("user_id"):
                user = await db.get(User, request.session["user_id"])
            ok = user is not None and user.is_admin and user.is_active
        if ok:
            request.session["user_id"] = user.id
        return ok


class UserAdmin(ModelView, model=User):
    icon = "fa-solid fa-user"
    column_list = [User.email, User.name, User.is_admin, User.is_active, User.email_verified, User.created_at]
    column_searchable_list = [User.email, User.name]
    column_sortable_list = [User.email, User.created_at]
    column_default_sort = [(User.created_at, True)]
    column_details_exclude_list = [User.password_hash, User.prefs]
    column_export_exclude_list = [User.password_hash]
    form_columns = [User.email, User.name, User.is_admin, User.is_active, User.email_verified]
    can_create = False  # python -m app.cli create-admin, or sign up


class DesignAdmin(ModelView, model=Design):
    icon = "fa-solid fa-palette"
    column_list = [Design.title, Design.owner, Design.is_template, Design.template_category, Design.template_order,
                   Design.page_count, Design.updated_at, Design.deleted_at]
    column_searchable_list = [Design.title, Design.template_category]
    column_sortable_list = [Design.title, Design.updated_at, Design.is_template, Design.template_order]
    column_default_sort = [(Design.updated_at, True)]
    column_details_exclude_list = [Design.ystate, Design.doc]
    column_export_exclude_list = [Design.ystate, Design.doc]
    form_columns = [Design.title, Design.is_template, Design.template_category, Design.template_order]
    can_create = False


class FontAdmin(ModelView, model=Font):
    icon = "fa-solid fa-font"
    column_list = [Font.family, Font.category, Font.license, Font.owner_id, Font.created_at]
    column_searchable_list = [Font.family]
    column_sortable_list = [Font.family, Font.category]
    form_columns = [Font.family, Font.category, Font.license, Font.files]


def _clean_svg_text(svg: str) -> str:
    from .routers.assets import _clean_svg

    return _clean_svg(svg.encode()).decode()


class LibraryElementAdmin(ModelView, model=LibraryElement):
    name = "Library element"
    icon = "fa-solid fa-shapes"
    column_list = [LibraryElement.name, LibraryElement.kind, LibraryElement.tags, LibraryElement.created_at]
    column_searchable_list = [LibraryElement.name, LibraryElement.tags]
    form_columns = [LibraryElement.name, LibraryElement.kind, LibraryElement.tags, LibraryElement.svg,
                    LibraryElement.url]
    form_overrides = {"svg": TextAreaField}
    form_widget_args = {"svg": {"rows": 12, "placeholder": "Paste the SVG markup here"},
                        "kind": {"placeholder": "illustration or sticker"}}

    async def on_model_change(self, data: dict, model, is_created: bool, request: Request) -> None:
        if data.get("svg"):
            cleaned = _clean_svg_text(data["svg"])
            data["svg"] = cleaned
            model.svg = cleaned


class AssetAdmin(ModelView, model=Asset):
    icon = "fa-solid fa-image"
    column_list = [Asset.filename, Asset.kind, Asset.mime, Asset.size, Asset.owner_id, Asset.created_at]
    column_searchable_list = [Asset.filename]
    column_sortable_list = [Asset.size, Asset.created_at]
    column_default_sort = [(Asset.created_at, True)]
    column_formatters = {Asset.filename: lambda m, a: f"{m.filename} ({storage.url_for(m.key)})"}
    can_create = False
    can_edit = False

    async def after_model_delete(self, model, request: Request) -> None:
        await storage.remove(model.key)


class ShareLinkAdmin(ModelView, model=ShareLink):
    name = "Share link"
    icon = "fa-solid fa-link"
    column_list = [ShareLink.design, ShareLink.role, ShareLink.created_at, ShareLink.revoked_at]
    column_sortable_list = [ShareLink.created_at]
    column_default_sort = [(ShareLink.created_at, True)]
    column_details_exclude_list = [ShareLink.password_hash]
    column_export_exclude_list = [ShareLink.password_hash]
    form_columns = [ShareLink.role, ShareLink.revoked_at]
    can_create = False


def mount(app: FastAPI) -> Admin:
    admin = Admin(
        app, engine, session_maker=SessionLocal, base_url="/admin", title=f"{settings.site_name} admin",
        authentication_backend=AdminAuth(
            secret_key=settings.secret_key, session_cookie="ka_admin", same_site="lax",
            https_only=settings.cookie_secure, max_age=12 * 3600,
        ),
    )
    for view in (UserAdmin, DesignAdmin, FontAdmin, LibraryElementAdmin, AssetAdmin, ShareLinkAdmin):
        admin.add_view(view)
    return admin

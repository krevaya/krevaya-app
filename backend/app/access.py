"""Who can do what to a design.

Owners can edit. A share link grants view, comment or edit to whoever has the
token (and the password, if the link has one). Templates are readable by anyone.
"""

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, URLSafeSerializer, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import Design, ShareLink, User

ROLES = {"view": 1, "comment": 2, "edit": 3, "owner": 4}


def _signer() -> URLSafeSerializer:
    return URLSafeSerializer(get_settings().secret_key, salt="share-unlock")


def unlock_cookie_name(link_id: str) -> str:
    return f"ka_unlock_{link_id}"


def unlock_value(link_id: str) -> str:
    return _signer().dumps(link_id)


def is_unlocked(request: Request, link: ShareLink) -> bool:
    raw = request.cookies.get(unlock_cookie_name(link.id)) or request.headers.get("x-share-unlock", "")
    if not raw:
        return False
    try:
        return _signer().loads(raw) == link.id
    except BadSignature:
        return False


async def find_link(db: AsyncSession, token: str) -> ShareLink | None:
    if not token:
        return None
    link = (await db.execute(select(ShareLink).where(ShareLink.token == token))).scalar_one_or_none()
    if link is None or link.revoked_at is not None:
        return None
    return link


def snapshot_token(design_id: str) -> str:
    """Short-lived view access for the server-side exporter's headless browser."""
    return URLSafeTimedSerializer(get_settings().secret_key, salt="snapshot").dumps(design_id)


def _snapshot_grant(request: Request, design_id: str) -> bool:
    raw = request.headers.get("x-snapshot-token") or request.query_params.get("snapshot", "")
    if not raw:
        return False
    try:
        return URLSafeTimedSerializer(get_settings().secret_key, salt="snapshot").loads(raw, max_age=300) == design_id
    except BadSignature:
        return False


def share_token(request: Request) -> str:
    return request.headers.get("x-share-token") or request.query_params.get("share", "")


async def role_for(db: AsyncSession, design: Design, user: User | None, request: Request) -> str | None:
    if design.deleted_at is not None and (user is None or user.id != design.owner_id):
        return None
    if user is not None and user.id == design.owner_id:
        return "owner"
    link = await find_link(db, share_token(request))
    if link is not None and link.design_id == design.id:
        if link.password_hash and not is_unlocked(request, link):
            raise HTTPException(423, "This link needs a password")
        return link.role
    if design.is_template or _snapshot_grant(request, design.id):
        return "view"
    return None


async def load_design(db: AsyncSession, design_id: str, user: User | None, request: Request,
                      need: str = "view") -> tuple[Design, str]:
    design = await db.get(Design, design_id)
    if design is None:
        raise HTTPException(404, "Design not found")
    role = await role_for(db, design, user, request)
    if role is None:
        raise HTTPException(404, "Design not found")
    if ROLES[role] < ROLES[need]:
        raise HTTPException(403, "You can't do that with this link")
    return design, role

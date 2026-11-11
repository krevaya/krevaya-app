from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import find_link, is_unlocked, load_design, unlock_cookie_name, unlock_value
from ..config import get_settings
from ..db import get_db
from ..deps import current_user, optional_user
from ..hub import hub
from ..models import Comment, ShareLink, User
from ..ratelimit import client_ip, enforce
from ..security import hash_password, new_token, verify_password

router = APIRouter(prefix="/api", tags=["sharing"])
settings = get_settings()


class LinkIn(BaseModel):
    role: str = Field(pattern="^(view|comment|edit)$")
    password: str = Field(default="", max_length=200)


class UnlockIn(BaseModel):
    password: str


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    page_id: str = ""
    x: float | None = None
    y: float | None = None
    parent_id: str | None = None
    guest_name: str = Field(default="", max_length=80)


class CommentPatch(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=5000)
    resolved: bool | None = None


def link_out(link: ShareLink) -> dict:
    return {
        "id": link.id, "token": link.token, "role": link.role,
        "has_password": bool(link.password_hash),
        "url": f"{settings.site_url}/s/{link.token}",
        "created_at": link.created_at.isoformat(),
    }


@router.get("/designs/{design_id}/links")
async def list_links(design_id: str, request: Request, user: User = Depends(current_user),
                     db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "owner")
    rows = (await db.execute(
        select(ShareLink).where(ShareLink.design_id == design_id, ShareLink.revoked_at.is_(None))
        .order_by(ShareLink.created_at)
    )).scalars().all()
    return {"links": [link_out(link) for link in rows]}


@router.post("/designs/{design_id}/links")
async def create_link(design_id: str, body: LinkIn, request: Request, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "owner")
    link = ShareLink(design_id=design_id, token=new_token(18), role=body.role, created_by=user.id,
                     password_hash=hash_password(body.password) if body.password else None)
    db.add(link)
    await db.commit()
    return link_out(link)


@router.delete("/links/{link_id}")
async def revoke_link(link_id: str, request: Request, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    link = await db.get(ShareLink, link_id)
    if link is None or link.design.owner_id != user.id:
        raise HTTPException(404, "Link not found")
    link.revoked_at = datetime.now(UTC)
    await db.commit()
    await hub.drop_link(link.design_id, link.token)
    return {"ok": True}


class LinkPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(view|comment|edit)$")
    # "" takes the lock off, any other value sets it
    password: str | None = Field(default=None, max_length=200)


RANK = {"view": 0, "comment": 1, "edit": 2}


@router.patch("/links/{link_id}")
async def change_link(link_id: str, body: LinkPatch, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    link = await db.get(ShareLink, link_id)
    if link is None or link.revoked_at is not None or link.design.owner_id != user.id:
        raise HTTPException(404, "Link not found")
    # people already in through this link get sent out when it now allows less
    narrower = False
    if body.role is not None and body.role != link.role:
        narrower = RANK[body.role] < RANK[link.role]
        link.role = body.role
    if body.password is not None:
        narrower = narrower or bool(body.password)
        link.password_hash = hash_password(body.password) if body.password else None
    await db.commit()
    if narrower:
        await hub.drop_link(link.design_id, link.token)
    return link_out(link)


@router.get("/share/{token}")
async def open_link(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """What the /s/<token> page needs before it opens the editor."""
    link = await find_link(db, token)
    if link is None or link.design.deleted_at is not None:
        raise HTTPException(404, "This link doesn't work any more")
    locked = bool(link.password_hash) and not is_unlocked(request, link)
    return {
        "design_id": link.design_id, "role": link.role, "locked": locked,
        "title": None if locked else link.design.title,
    }


@router.post("/share/{token}/unlock")
async def unlock_link(token: str, body: UnlockIn, request: Request, response: Response,
                      db: AsyncSession = Depends(get_db)):
    await enforce(f"unlock:{client_ip(request)}", settings.rate_limit_login)
    link = await find_link(db, token)
    if link is None:
        raise HTTPException(404, "This link doesn't work any more")
    if not verify_password(body.password, link.password_hash):
        raise HTTPException(400, "Wrong password")
    value = unlock_value(link.id)
    response.set_cookie(unlock_cookie_name(link.id), value, max_age=30 * 86400, httponly=True,
                        samesite="lax", secure=settings.cookie_secure, path="/")
    return {"ok": True, "unlock": value}


# Comments


def comment_out(c: Comment) -> dict:
    return {
        "id": c.id, "parent_id": c.parent_id, "page_id": c.page_id, "x": c.x, "y": c.y,
        "body": c.body, "resolved": c.resolved,
        "author": (c.author.name or c.author.email.split("@")[0]) if c.author else (c.guest_name or "Guest"),
        "author_id": c.author_id,
        "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(),
    }


@router.get("/designs/{design_id}/comments")
async def list_comments(design_id: str, request: Request, user: User | None = Depends(optional_user),
                        db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "comment")
    rows = (await db.execute(
        select(Comment).where(Comment.design_id == design_id).order_by(Comment.created_at)
    )).scalars().all()
    return {"comments": [comment_out(c) for c in rows]}


@router.post("/designs/{design_id}/comments")
async def add_comment(design_id: str, body: CommentIn, request: Request,
                      user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    await load_design(db, design_id, user, request, "comment")
    await enforce(f"comment:{user.id if user else client_ip(request)}", "30/minute")
    if body.parent_id:
        parent = await db.get(Comment, body.parent_id)
        if parent is None or parent.design_id != design_id:
            raise HTTPException(400, "Can't reply to that")
    c = Comment(design_id=design_id, parent_id=body.parent_id, page_id=body.page_id, x=body.x, y=body.y,
                author_id=user.id if user else None, guest_name=body.guest_name.strip(), body=body.body.strip())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return comment_out(c)


@router.patch("/comments/{comment_id}")
async def edit_comment(comment_id: str, body: CommentPatch, request: Request,
                       user: User | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    c = await db.get(Comment, comment_id)
    if c is None:
        raise HTTPException(404, "Comment not found")
    _, role = await load_design(db, c.design_id, user, request, "comment")
    if body.body is not None:
        if user is None or user.id != c.author_id:
            raise HTTPException(403, "You can only edit your own comments")
        c.body = body.body.strip()
    if body.resolved is not None:
        c.resolved = body.resolved
    await db.commit()
    return comment_out(c)


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, request: Request, user: User | None = Depends(optional_user),
                         db: AsyncSession = Depends(get_db)):
    c = await db.get(Comment, comment_id)
    if c is None:
        raise HTTPException(404, "Comment not found")
    _, role = await load_design(db, c.design_id, user, request, "comment")
    if role != "owner" and (user is None or user.id != c.author_id):
        raise HTTPException(403, "You can only delete your own comments")
    await db.delete(c)
    await db.commit()
    return {"ok": True}

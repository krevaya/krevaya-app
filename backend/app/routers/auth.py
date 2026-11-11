from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import mail
from ..config import get_settings
from ..db import get_db
from ..deps import COOKIE, current_user, optional_user
from ..models import EmailToken, Session, User
from ..ratelimit import client_ip, enforce
from ..security import hash_password, new_token, sha256, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class MeIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    prefs: dict | None = None


class PasswordIn(BaseModel):
    current: str = ""
    new: str = Field(min_length=8, max_length=200)


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "is_admin": u.is_admin,
        "email_verified": u.email_verified,
        "has_password": bool(u.password_hash),
        "prefs": u.prefs or {},
    }


async def start_session(db: AsyncSession, user: User, request: Request, response: Response) -> None:
    raw = new_token()
    db.add(Session(
        id=sha256(raw),
        user_id=user.id,
        expires_at=datetime.now(UTC) + timedelta(days=settings.session_ttl_days),
        user_agent=request.headers.get("user-agent", "")[:255],
    ))
    await db.commit()
    response.set_cookie(
        COOKIE, raw,
        max_age=settings.session_ttl_days * 86400,
        httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )


async def make_email_token(db: AsyncSession, user: User, purpose: str, hours: int) -> str:
    raw = new_token()
    db.add(EmailToken(id=sha256(raw), user_id=user.id, purpose=purpose,
                      expires_at=datetime.now(UTC) + timedelta(hours=hours)))
    await db.commit()
    return raw


async def use_email_token(db: AsyncSession, raw: str, purpose: str) -> User:
    tok = await db.get(EmailToken, sha256(raw))
    if tok is None or tok.purpose != purpose or tok.used_at is not None:
        raise HTTPException(400, "This link is invalid or was already used")
    expires = tok.expires_at if tok.expires_at.tzinfo else tok.expires_at.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise HTTPException(400, "This link has expired")
    tok.used_at = datetime.now(UTC)
    user = await db.get(User, tok.user_id)
    return user


async def send_verification(db: AsyncSession, user: User) -> None:
    raw = await make_email_token(db, user, "verify", 72)
    await mail.send(
        user.email,
        f"Confirm your email for {settings.site_name}",
        f"Hi{' ' + user.name if user.name else ''},\n\n"
        f"Open this link to confirm your email:\n{settings.site_url}/verify?token={raw}\n\n"
        "If you didn't sign up, you can ignore this email.\n",
    )


@router.get("/config")
async def auth_config():
    return {
        "signup": settings.allow_signup,
        "google": settings.google_enabled,
        "oidc": settings.oidc_label if settings.oidc_enabled else None,
    }


@router.post("/signup")
async def signup(body: SignupIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if not settings.allow_signup:
        raise HTTPException(403, "New accounts are closed right now")
    await enforce(f"signup:{client_ip(request)}", settings.rate_limit_login)
    email = body.email.lower()
    if (await db.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, "There's already an account with that email")
    # The first account on a fresh server becomes the admin.
    first = (await db.execute(select(func.count(User.id)))).scalar_one() == 0
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), is_admin=first)
    db.add(user)
    await db.commit()
    await start_session(db, user, request, response)
    await send_verification(db, user)
    return user_out(user)


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    await enforce(f"login:{client_ip(request)}", settings.rate_limit_login)
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(400, "Wrong email or password")
    await start_session(db, user, request, response)
    return user_out(user)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get(COOKIE)
    if raw:
        await db.execute(delete(Session).where(Session.id == sha256(raw)))
        await db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: User | None = Depends(optional_user)):
    return {"user": user_out(user) if user else None}


@router.patch("/me")
async def update_me(body: MeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    user = await db.merge(user)
    if body.name is not None:
        user.name = body.name.strip()
    if body.prefs is not None:
        user.prefs = {**(user.prefs or {}), **body.prefs}
    await db.commit()
    return user_out(user)


@router.post("/password")
async def change_password(body: PasswordIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    user = await db.merge(user)
    if user.password_hash and not verify_password(body.current, user.password_hash):
        raise HTTPException(400, "Your current password is wrong")
    user.password_hash = hash_password(body.new)
    await db.commit()
    return {"ok": True}


@router.post("/verify")
async def verify(body: dict, db: AsyncSession = Depends(get_db)):
    user = await use_email_token(db, str(body.get("token", "")), "verify")
    user.email_verified = True
    await db.commit()
    return {"ok": True}


@router.post("/verify/resend")
async def resend_verification(request: Request, user: User = Depends(current_user),
                              db: AsyncSession = Depends(get_db)):
    await enforce(f"verify:{user.id}", "3/hour")
    await send_verification(db, user)
    return {"ok": True}


@router.post("/forgot")
async def forgot(body: dict, request: Request, db: AsyncSession = Depends(get_db)):
    await enforce(f"forgot:{client_ip(request)}", "5/hour")
    email = str(body.get("email", "")).lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user and user.is_active:
        raw = await make_email_token(db, user, "reset", 2)
        await mail.send(
            user.email,
            f"Reset your {settings.site_name} password",
            f"Someone asked to reset the password for this account.\n\n"
            f"Choose a new one here (the link works for 2 hours):\n{settings.site_url}/reset?token={raw}\n\n"
            "If it wasn't you, ignore this email and nothing changes.\n",
        )
    # Same answer either way, so this can't be used to find accounts.
    return {"ok": True}


@router.post("/reset")
async def reset(body: ResetIn, db: AsyncSession = Depends(get_db)):
    user = await use_email_token(db, body.token, "reset")
    user.password_hash = hash_password(body.password)
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return {"ok": True}

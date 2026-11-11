"""Sign in with Google or any OpenID Connect provider.

The state, nonce and PKCE verifier travel in a signed cookie that lives for ten
minutes, so there's no server-side session to keep. Accounts are matched by the
provider's subject id first, then by verified email.
"""

import logging
import time
from urllib.parse import quote

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import KeySet
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..security import new_token
from .auth import start_session

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

COOKIE = "ka_oauth"
COOKIE_AGE = 600
GOOGLE_ISSUER = "https://accounts.google.com"

_cache: dict[str, tuple[float, dict]] = {}


class LoginFailed(Exception):
    pass


def _provider(name: str) -> dict:
    if name == "google" and settings.google_enabled:
        return {"name": "google", "issuer": GOOGLE_ISSUER, "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret, "scope": "openid email profile",
                "sub_field": "google_sub"}
    if name == "oidc" and settings.oidc_enabled:
        return {"name": "oidc", "issuer": settings.oidc_issuer.rstrip("/"), "client_id": settings.oidc_client_id,
                "client_secret": settings.oidc_client_secret, "scope": settings.oidc_scopes,
                "sub_field": "oidc_sub"}
    raise HTTPException(404, "That sign-in option isn't available here")


async def _get_json(url: str, ttl: int = 3600) -> dict:
    hit = _cache.get(url)
    if hit and hit[0] > time.time():
        return hit[1]
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()
    _cache[url] = (time.time() + ttl, data)
    return data


async def _metadata(issuer: str) -> dict:
    return await _get_json(f"{issuer}/.well-known/openid-configuration")


def _signer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt="oauth-state")


def _redirect_uri(name: str) -> str:
    return f"{settings.site_url.rstrip('/')}/api/auth/{name}/callback"


def _client(p: dict) -> AsyncOAuth2Client:
    return AsyncOAuth2Client(
        client_id=p["client_id"], client_secret=p["client_secret"] or None, scope=p["scope"],
        redirect_uri=_redirect_uri(p["name"]), code_challenge_method="S256",
        token_endpoint_auth_method="client_secret_post" if p["client_secret"] else "none",
        timeout=15,
    )


def _safe_next(value: str) -> str:
    # only same-site paths, never //evil.example or a full URL
    if value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value
    return "/"


def _fail(message: str) -> RedirectResponse:
    resp = RedirectResponse(f"/login?error={quote(message)}", status_code=303)
    resp.delete_cookie(COOKIE, path="/api/auth")
    return resp


@router.get("/{provider}/start")
async def oauth_start(provider: str, next: str = "/"):
    p = _provider(provider)
    meta = await _metadata(p["issuer"])
    state, nonce, verifier = new_token(16), new_token(16), new_token(48)
    async with _client(p) as client:
        url, _ = client.create_authorization_url(
            meta["authorization_endpoint"], state=state, nonce=nonce, code_verifier=verifier,
        )
    resp = RedirectResponse(url, status_code=302)
    payload = {"p": provider, "s": state, "n": nonce, "v": verifier, "next": _safe_next(next)}
    resp.set_cookie(COOKIE, _signer().dumps(payload), max_age=COOKIE_AGE, httponly=True, samesite="lax",
                    secure=settings.cookie_secure, path="/api/auth")
    return resp


async def _claims(p: dict, meta: dict, token: dict, nonce: str) -> dict:
    claims: dict = {}
    id_token = token.get("id_token")
    if id_token:
        keys = KeySet.import_key_set(await _get_json(meta["jwks_uri"]))
        try:
            decoded = jwt.decode(id_token, keys)
            jwt.JWTClaimsRegistry(
                iss={"essential": True, "values": [p["issuer"], meta.get("issuer", p["issuer"])]},
                aud={"essential": True, "value": p["client_id"]},
                exp={"essential": True},
                nonce={"essential": True, "value": nonce},
            ).validate(decoded.claims)
        except (JoseError, ValueError) as e:
            raise LoginFailed("The sign-in response couldn't be verified") from e
        claims = dict(decoded.claims)
    if meta.get("userinfo_endpoint") and ("email" not in claims or "email_verified" not in claims):
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(meta["userinfo_endpoint"],
                                 headers={"Authorization": f"Bearer {token['access_token']}"})
        if r.status_code == 200:
            info = r.json()
            if claims and info.get("sub") != claims.get("sub"):
                raise LoginFailed("The sign-in response didn't add up")
            claims = {**info, **claims}
    if not claims.get("sub"):
        raise LoginFailed("The provider didn't say who you are")
    return claims


def _verified(claims: dict) -> bool:
    v = claims.get("email_verified")
    return v is True or (isinstance(v, str) and v.lower() == "true")


async def _find_or_create(db: AsyncSession, p: dict, claims: dict) -> User:
    field = getattr(User, p["sub_field"])
    sub = str(claims["sub"])
    user = (await db.execute(select(User).where(field == sub))).scalar_one_or_none()
    if user is not None:
        return user
    email = str(claims.get("email") or "").strip().lower()
    if not email or not _verified(claims):
        raise LoginFailed("Your account there needs a verified email address")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        if not settings.allow_signup:
            raise LoginFailed("New accounts are closed right now")
        first = (await db.execute(select(func.count(User.id)))).scalar_one() == 0
        name = str(claims.get("name") or claims.get("given_name") or "")[:120]
        user = User(email=email, name=name, is_admin=first)
        db.add(user)
    setattr(user, p["sub_field"], sub)
    user.email_verified = True
    await db.commit()
    return user


@router.get("/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: AsyncSession = Depends(get_db)):
    p = _provider(provider)
    params = request.query_params
    try:
        saved = _signer().loads(request.cookies.get(COOKIE, ""), max_age=COOKIE_AGE)
    except BadSignature:
        return _fail("That sign-in took too long. Try again.")
    if saved.get("p") != provider or not params.get("state") or params.get("state") != saved.get("s"):
        return _fail("That sign-in link doesn't match. Try again.")
    if params.get("error"):
        return _fail("Sign-in was canceled")
    try:
        meta = await _metadata(p["issuer"])
        async with _client(p) as client:
            token = await client.fetch_token(meta["token_endpoint"], code=params.get("code", ""),
                                             code_verifier=saved["v"])
        claims = await _claims(p, meta, token, saved["n"])
        user = await _find_or_create(db, p, claims)
    except LoginFailed as e:
        return _fail(str(e))
    except Exception:
        log.exception("%s sign-in failed", provider)
        return _fail("Sign-in didn't work. Try again.")
    if not user.is_active:
        return _fail("This account is turned off")
    resp = RedirectResponse(saved.get("next") or "/", status_code=303)
    resp.delete_cookie(COOKIE, path="/api/auth")
    await start_session(db, user, request, resp)
    return resp

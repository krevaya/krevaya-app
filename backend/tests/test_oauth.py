import time
from urllib.parse import parse_qs, urlparse

import pytest
from authlib.integrations.httpx_client import AsyncOAuth2Client
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey

from app.config import get_settings
from app.routers import oauth

ISSUER = "https://idp.example"
KEY = RSAKey.generate_key(2048, parameters={"kid": "k1", "use": "sig", "alg": "RS256"}, private=True)


@pytest.fixture
def idp(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "oidc_issuer", ISSUER)
    monkeypatch.setattr(s, "oidc_client_id", "client-1")
    monkeypatch.setattr(s, "oidc_client_secret", "secret")
    docs = {
        f"{ISSUER}/.well-known/openid-configuration": {
            "issuer": ISSUER, "authorization_endpoint": f"{ISSUER}/auth", "token_endpoint": f"{ISSUER}/token",
            "jwks_uri": f"{ISSUER}/jwks",
        },
        f"{ISSUER}/jwks": KeySet([KEY]).as_dict(private=False),
    }

    async def fake_get_json(url, ttl=3600):
        return docs[url]

    monkeypatch.setattr(oauth, "_get_json", fake_get_json)
    claims = {}

    async def fake_fetch_token(self, url, code=None, code_verifier=None, **kw):
        assert url == f"{ISSUER}/token" and code == "the-code" and code_verifier
        now = int(time.time())
        body = {"iss": ISSUER, "aud": "client-1", "iat": now, "exp": now + 300, **claims}
        return {"access_token": "at", "id_token": jwt.encode({"alg": "RS256", "kid": "k1"}, body, KEY)}

    monkeypatch.setattr(AsyncOAuth2Client, "fetch_token", fake_fetch_token)
    return claims


async def _login(c, claims, **override):
    r = await c.get("/api/auth/oidc/start", params={"next": "/designs"})
    assert r.status_code == 302
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["code_challenge_method"] == ["S256"]
    claims.clear()
    claims.update({"nonce": q["nonce"][0], **override})
    return await c.get("/api/auth/oidc/callback", params={"code": "the-code", "state": q["state"][0]})


async def test_oidc_creates_and_links(idp, anon, user):
    r = await _login(anon, idp, sub="abc", email="new-person@example.com", email_verified=True, name="New")
    assert r.status_code == 303 and r.headers["location"] == "/designs"
    me = (await anon.get("/api/auth/me")).json()["user"]
    assert me["email"] == "new-person@example.com" and me["email_verified"] and me["name"] == "New"

    # an existing account is linked by verified email
    await user.post("/api/auth/logout")
    r = await _login(user, idp, sub="xyz", email=user.email, email_verified=True)
    assert r.status_code == 303
    assert (await user.get("/api/auth/me")).json()["user"]["id"] == user.user["id"]

    # and found again by subject even if the email changed there
    await user.post("/api/auth/logout")
    r = await _login(user, idp, sub="xyz", email="changed@example.com", email_verified=True)
    assert (await user.get("/api/auth/me")).json()["user"]["id"] == user.user["id"]


async def test_oidc_rejects_unverified_and_bad_nonce(idp, anon, user):
    r = await _login(anon, idp, sub="u1", email=user.email, email_verified=False)
    assert r.headers["location"].startswith("/login?error=")
    assert (await anon.get("/api/auth/me")).json()["user"] is None

    r = await _login(anon, idp, sub="u2", email="x@example.com", email_verified=True)
    idp["nonce"] = "wrong"
    r = await anon.get("/api/auth/oidc/start")
    state = parse_qs(urlparse(r.headers["location"]).query)["state"][0]
    await anon.post("/api/auth/logout")
    r = await anon.get("/api/auth/oidc/callback", params={"code": "the-code", "state": state})
    assert r.headers["location"].startswith("/login?error=")
    assert (await anon.get("/api/auth/me")).json()["user"] is None


async def test_oidc_state_mismatch_and_signup_closed(idp, anon, monkeypatch):
    await anon.get("/api/auth/oidc/start")
    r = await anon.get("/api/auth/oidc/callback", params={"code": "the-code", "state": "forged"})
    assert r.headers["location"].startswith("/login?error=")

    monkeypatch.setattr(get_settings(), "allow_signup", False)
    r = await _login(anon, idp, sub="closed", email="closed@example.com", email_verified=True)
    assert "New accounts" in r.headers["location"] or "New accounts" in parse_qs(
        urlparse(r.headers["location"]).query)["error"][0]


async def test_disabled_provider(anon):
    assert (await anon.get("/api/auth/google/start")).status_code == 404


def test_safe_next():
    assert oauth._safe_next("/design/1") == "/design/1"
    assert oauth._safe_next("//evil.example") == "/"
    assert oauth._safe_next("https://evil.example") == "/"

from app import ratelimit
from app.config import get_settings


async def test_signup_login_logout(anon, make_user):
    c = await make_user("Alex")
    me = (await c.get("/api/auth/me")).json()["user"]
    assert me["email"] == c.email
    assert me["name"] == "Alex"
    assert me["has_password"] is True

    r = await c.post("/api/auth/logout")
    assert r.status_code == 200
    assert (await c.get("/api/auth/me")).json()["user"] is None

    r = await c.post("/api/auth/login", json={"email": c.email, "password": "wrong-password"})
    assert r.status_code == 400
    r = await c.post("/api/auth/login", json={"email": c.email.upper(), "password": c.password})
    assert r.status_code == 200
    assert (await c.get("/api/auth/me")).json()["user"]["email"] == c.email


async def test_duplicate_signup(anon, user):
    r = await anon.post("/api/auth/signup", json={"email": user.email, "password": "password123"})
    assert r.status_code == 409


async def test_update_me_and_password(user):
    r = await user.patch("/api/auth/me", json={"name": "New name", "prefs": {"theme": "dark"}})
    assert r.status_code == 200
    assert r.json()["name"] == "New name"
    assert r.json()["prefs"]["theme"] == "dark"

    r = await user.post("/api/auth/password", json={"current": "nope", "new": "another-pass"})
    assert r.status_code == 400
    r = await user.post("/api/auth/password", json={"current": user.password, "new": "another-pass"})
    assert r.status_code == 200
    await user.post("/api/auth/logout")
    r = await user.post("/api/auth/login", json={"email": user.email, "password": "another-pass"})
    assert r.status_code == 200


async def test_protected_routes_need_login(anon):
    assert (await anon.get("/api/designs")).status_code == 401
    assert (await anon.get("/api/tokens")).status_code == 401


async def test_cross_site_post_refused(user):
    r = await user.post("/api/designs", json={}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403


async def test_login_rate_limit(anon, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_login", "3/minute")
    ratelimit._counts.clear()
    codes = []
    for _ in range(5):
        # a spoofed forwarding header doesn't get a fresh bucket
        r = await anon.post("/api/auth/login", json={"email": "nobody@example.com", "password": "x"},
                            headers={"x-forwarded-for": f"203.0.113.{len(codes)}"})
        codes.append(r.status_code)
    assert codes[:3] == [400, 400, 400]
    assert codes[3:] == [429, 429]


async def test_rate_limit_rules():
    assert ratelimit.parse("10/minute") == (10, 60)
    assert ratelimit.parse("5/hours") == (5, 3600)
    ratelimit._counts.clear()
    assert await ratelimit.hit("t", "2/minute")
    assert await ratelimit.hit("t", "2/minute")
    assert not await ratelimit.hit("t", "2/minute")

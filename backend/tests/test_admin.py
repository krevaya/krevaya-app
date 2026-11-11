from tests.conftest import make_admin


async def test_admin_needs_admin(anon, make_user):
    r = await anon.get("/admin/")
    assert r.status_code in (302, 303, 307)
    assert "/admin/login" in r.headers["location"]

    plain = await make_user("Plain")
    await make_admin(plain, False)  # the first account on a fresh server is an admin
    r = await plain.get("/admin/")
    assert r.status_code in (302, 303, 307)

    r = await anon.post("/admin/login", data={"username": plain.email, "password": plain.password})
    assert r.status_code == 400


async def test_admin_cookie_and_login(anon, make_user, design, user):
    await make_admin(user)
    r = await user.get("/admin/")
    assert r.status_code == 200

    for path in ("user", "design", "font", "library-element", "asset", "share-link"):
        r = await user.get(f"/admin/{path}/list")
        assert r.status_code == 200, (path, r.status_code)
    page = (await user.get("/admin/user/list")).text
    assert user.email in page and "argon2" not in page

    r = await anon.post("/admin/login", data={"username": user.email, "password": user.password})
    assert r.status_code == 302
    assert (await anon.get("/admin/design/list")).status_code == 200
    assert "Poster" in (await anon.get("/admin/design/list")).text


async def test_admin_library_svg_is_cleaned(user, anon):
    await make_admin(user)
    svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><circle r="4"/></svg>'
    r = await user.post("/admin/library-element/create",
                        data={"name": "Dot", "kind": "sticker", "tags": "dot", "svg": svg, "url": ""})
    assert r.status_code in (200, 302), r.text[:500]
    els = (await anon.get("/api/elements", params={"q": "Dot"})).json()["elements"]
    assert len(els) == 1
    assert "script" not in els[0]["svg"] and "onload" not in els[0]["svg"] and "circle" in els[0]["svg"]

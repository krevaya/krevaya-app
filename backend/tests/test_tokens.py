async def test_token_lifecycle(user, anon, design):
    r = await user.post("/api/tokens", json={"name": "Script"})
    assert r.status_code == 200
    created = r.json()
    raw = created["token"]
    assert raw.startswith("ka_") and created["prefix"] == raw[:11]

    listed = (await user.get("/api/tokens")).json()["tokens"]
    assert [t["name"] for t in listed] == ["Script"]
    assert "token" not in listed[0]

    h = {"authorization": f"Bearer {raw}"}
    r = await anon.get("/api/designs", headers=h)
    assert r.status_code == 200
    assert [d["id"] for d in r.json()["designs"]] == [design["id"]]

    # token requests skip the same-origin check (no cookies involved)
    r = await anon.post("/api/designs", json={"title": "Via token"}, headers={**h, "origin": "https://x.example"})
    assert r.status_code == 200

    # a token can't mint more tokens
    assert (await anon.post("/api/tokens", json={"name": "More"}, headers=h)).status_code == 403

    assert (await user.delete(f"/api/tokens/{created['id']}")).status_code == 200
    assert (await anon.get("/api/designs", headers=h)).status_code == 401
    assert (await user.get("/api/tokens")).json()["tokens"] == []
    assert (await user.delete(f"/api/tokens/{created['id']}")).status_code == 404


async def test_bad_token(anon):
    r = await anon.get("/api/designs", headers={"authorization": "Bearer ka_nope"})
    assert r.status_code == 401


async def test_cant_revoke_others(make_user):
    a = await make_user("A")
    b = await make_user("B")
    tid = (await a.post("/api/tokens", json={"name": "x"})).json()["id"]
    assert (await b.delete(f"/api/tokens/{tid}")).status_code == 404

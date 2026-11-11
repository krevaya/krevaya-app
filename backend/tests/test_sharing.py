async def _link(c, design_id, role, password=""):
    r = await c.post(f"/api/designs/{design_id}/links", json={"role": role, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


async def test_link_roles(user, design, anon):
    did = design["id"]
    view = await _link(user, did, "view")
    edit = await _link(user, did, "edit")

    info = (await anon.get(f"/api/share/{view['token']}")).json()
    assert info == {"design_id": did, "role": "view", "locked": False, "title": "Poster"}

    h = {"x-share-token": view["token"]}
    r = await anon.get(f"/api/designs/{did}", headers=h)
    assert r.status_code == 200 and r.json()["role"] == "view"
    assert (await anon.patch(f"/api/designs/{did}", json={"title": "x"}, headers=h)).status_code == 403
    assert (await anon.get(f"/api/designs/{did}/comments", headers=h)).status_code == 403

    h = {"x-share-token": edit["token"]}
    r = await anon.patch(f"/api/designs/{did}", json={"title": "Edited by link"}, headers=h)
    assert r.status_code == 200

    # no token, no access
    assert (await anon.get(f"/api/designs/{did}")).status_code == 404

    links = (await user.get(f"/api/designs/{did}/links")).json()["links"]
    assert {link["role"] for link in links} == {"view", "edit"}

    assert (await user.delete(f"/api/links/{edit['id']}")).status_code == 200
    assert (await anon.get(f"/api/designs/{did}", headers=h)).status_code == 404
    assert (await anon.get(f"/api/share/{edit['token']}")).status_code == 404


async def test_password_unlock(user, design, anon):
    did = design["id"]
    link = await _link(user, did, "view", password="open-sesame")
    assert link["has_password"]

    info = (await anon.get(f"/api/share/{link['token']}")).json()
    assert info["locked"] is True and info["title"] is None

    h = {"x-share-token": link["token"]}
    assert (await anon.get(f"/api/designs/{did}", headers=h)).status_code == 423

    r = await anon.post(f"/api/share/{link['token']}/unlock", json={"password": "wrong"})
    assert r.status_code == 400
    r = await anon.post(f"/api/share/{link['token']}/unlock", json={"password": "open-sesame"})
    assert r.status_code == 200
    # the cookie is set on the client, so the design opens now
    assert (await anon.get(f"/api/designs/{did}", headers=h)).status_code == 200
    assert (await anon.get(f"/api/share/{link['token']}")).json()["locked"] is False


async def test_change_link_access_and_lock(make_user, user, design, anon):
    did = design["id"]
    link = await _link(user, did, "edit")
    h = {"x-share-token": link["token"]}

    r = await user.patch(f"/api/links/{link['id']}", json={"role": "view"})
    assert r.status_code == 200 and r.json()["role"] == "view"
    assert (await anon.patch(f"/api/designs/{did}", json={"title": "x"}, headers=h)).status_code == 403

    r = await user.patch(f"/api/links/{link['id']}", json={"password": "hush"})
    assert r.json()["has_password"] is True
    assert (await anon.get(f"/api/designs/{did}", headers=h)).status_code == 423
    r = await user.patch(f"/api/links/{link['id']}", json={"password": ""})
    assert r.json()["has_password"] is False
    assert (await anon.get(f"/api/designs/{did}", headers=h)).status_code == 200

    other = await make_user("Other")
    assert (await other.patch(f"/api/links/{link['id']}", json={"role": "edit"})).status_code == 404
    assert (await user.patch(f"/api/links/{link['id']}", json={"role": "owner"})).status_code == 422


async def test_only_owner_manages_links(make_user, design):
    other = await make_user("Other")
    r = await other.post(f"/api/designs/{design['id']}/links", json={"role": "edit"})
    assert r.status_code == 404


async def test_comment_permissions(make_user, user, design, anon):
    did = design["id"]
    comment_link = await _link(user, did, "comment")
    h = {"x-share-token": comment_link["token"]}

    r = await anon.post(f"/api/designs/{did}/comments", json={"body": "Nice", "guest_name": "Kim"}, headers=h)
    assert r.status_code == 200
    guest_comment = r.json()
    assert guest_comment["author"] == "Kim"

    commenter = await make_user("Commenter")
    r = await commenter.post(f"/api/designs/{did}/comments", json={"body": "Mine"}, headers=h)
    mine = r.json()
    r = await commenter.post(f"/api/designs/{did}/comments",
                             json={"body": "Reply", "parent_id": guest_comment["id"]}, headers=h)
    assert r.json()["parent_id"] == guest_comment["id"]

    # can't edit someone else's comment, but can resolve it
    r = await commenter.patch(f"/api/comments/{guest_comment['id']}", json={"body": "hacked"}, headers=h)
    assert r.status_code == 403
    r = await commenter.patch(f"/api/comments/{guest_comment['id']}", json={"resolved": True}, headers=h)
    assert r.json()["resolved"] is True
    r = await commenter.patch(f"/api/comments/{mine['id']}", json={"body": "Edited"}, headers=h)
    assert r.json()["body"] == "Edited"

    assert (await commenter.delete(f"/api/comments/{guest_comment['id']}", headers=h)).status_code == 403
    assert (await commenter.delete(f"/api/comments/{mine['id']}", headers=h)).status_code == 200
    # the owner can delete anything
    assert (await user.delete(f"/api/comments/{guest_comment['id']}")).status_code == 200

    # view links can't comment
    view_link = await _link(user, did, "view")
    r = await anon.post(f"/api/designs/{did}/comments", json={"body": "x"},
                        headers={"x-share-token": view_link["token"]})
    assert r.status_code == 403

    comments = (await user.get(f"/api/designs/{did}/comments")).json()["comments"]
    assert comments == []  # the reply went with its parent

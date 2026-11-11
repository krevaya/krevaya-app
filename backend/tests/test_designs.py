from pycrdt import Array, Doc, Map

from app import docmodel
from tests.conftest import make_admin


async def test_create_list_get_patch(user, design):
    assert design["role"] == "owner"
    assert design["width"] == 800 and design["height"] == 600

    listed = (await user.get("/api/designs")).json()["designs"]
    assert [d["id"] for d in listed] == [design["id"]]

    got = (await user.get(f"/api/designs/{design['id']}")).json()
    assert got["doc"]["pages"][0]["width"] == 800
    assert got["doc"]["pages"][0]["elements"] == []

    r = await user.patch(f"/api/designs/{design['id']}", json={"title": "Renamed"})
    assert r.json()["title"] == "Renamed"
    assert (await user.get("/api/designs", params={"q": "renam"})).json()["designs"][0]["title"] == "Renamed"


async def test_other_users_cant_see(make_user, design, user):
    other = await make_user("Other")
    assert (await other.get(f"/api/designs/{design['id']}")).status_code == 404
    assert (await other.patch(f"/api/designs/{design['id']}", json={"title": "x"})).status_code == 404
    assert (await other.get("/api/designs")).json()["designs"] == []


async def test_trash_restore_delete(user, design):
    did = design["id"]
    assert (await user.delete(f"/api/designs/{did}")).status_code == 200
    assert (await user.get("/api/designs")).json()["designs"] == []
    trash = (await user.get("/api/designs", params={"trash": True})).json()["designs"]
    assert [d["id"] for d in trash] == [did]

    assert (await user.post(f"/api/designs/{did}/restore")).status_code == 200
    assert len((await user.get("/api/designs")).json()["designs"]) == 1

    assert (await user.delete(f"/api/designs/{did}", params={"permanent": True})).status_code == 200
    assert (await user.get(f"/api/designs/{did}")).status_code == 404


async def test_duplicate(user, design):
    r = await user.post(f"/api/designs/{design['id']}/duplicate")
    assert r.status_code == 200
    copy = r.json()
    assert copy["id"] != design["id"]
    assert copy["title"] == "Poster (copy)"
    assert len((await user.get("/api/designs")).json()["designs"]) == 2


async def test_create_from_doc(user):
    doc = {"pages": [{"width": 300, "height": 200, "background": {"type": "solid", "color": "#000"},
                      "elements": [{"type": "text", "text": "Hi", "x": 1, "y": 2, "width": 50, "height": 20,
                                    "rotation": 0, "opacity": 1}]}], "settings": {}}
    r = await user.post("/api/designs", json={"title": "From doc", "doc": doc})
    d = (await user.get(f"/api/designs/{r.json()['id']}")).json()
    assert d["width"] == 300
    el = d["doc"]["pages"][0]["elements"][0]
    assert el["text"] == "Hi" and el["id"]


async def test_state_round_trip(user, design):
    did = design["id"]
    state = (await user.get(f"/api/designs/{did}/state")).content
    doc = Doc()
    doc.get("pages", type=Array)
    doc.get("settings", type=Map)
    doc.apply_update(state)
    before = doc.get_state()
    pages = doc.get("pages", type=Array)
    with doc.transaction():
        pages[0]["elements"].append(Map({"id": "abc", "type": "text", "text": "Hello", "x": 10, "y": 10,
                                         "width": 100, "height": 30, "rotation": 0, "opacity": 1}))
    update = doc.get_update(before)

    r = await user.post(f"/api/designs/{did}/state", content=update,
                        headers={"content-type": "application/octet-stream"})
    assert r.status_code == 200, r.text

    again = docmodel.state_to_json((await user.get(f"/api/designs/{did}/state")).content)
    assert again["pages"][0]["elements"][0]["text"] == "Hello"

    # bad bytes are refused, not stored
    r = await user.post(f"/api/designs/{did}/state", content=b"\xff\xff\xff",
                        headers={"content-type": "application/octet-stream"})
    assert r.status_code == 400


async def test_versions_save_restore(user, design):
    did = design["id"]
    r = await user.post(f"/api/designs/{did}/versions", json={"label": "Empty"})
    assert r.status_code == 200
    vid = r.json()["id"]

    from app.hub import hub

    await hub.edit(did, lambda d: docmodel.add_element(d, 0, {"type": "shape", "shape": "rect", "x": 0,
                                                              "y": 0, "width": 5, "height": 5}))
    state = docmodel.state_to_json((await user.get(f"/api/designs/{did}/state")).content)
    assert len(state["pages"][0]["elements"]) == 1

    versions = (await user.get(f"/api/designs/{did}/versions")).json()["versions"]
    assert any(v["id"] == vid and v["label"] == "Empty" for v in versions)
    got = (await user.get(f"/api/designs/{did}/versions/{vid}")).json()
    assert got["doc"]["pages"][0]["elements"] == []

    assert (await user.post(f"/api/designs/{did}/versions/{vid}/restore")).status_code == 200
    state = docmodel.state_to_json((await user.get(f"/api/designs/{did}/state")).content)
    assert state["pages"][0]["elements"] == []
    labels = [v["label"] for v in (await user.get(f"/api/designs/{did}/versions")).json()["versions"]]
    assert "Before restoring an older version" in labels


async def test_templates(make_user, user, design):
    other = await make_user("Viewer")
    # only admins can mark templates
    r = await other.put(f"/api/designs/{design['id']}/template", json={"is_template": True})
    assert r.status_code == 403

    await make_admin(user)
    r = await user.put(f"/api/designs/{design['id']}/template",
                       json={"is_template": True, "category": "Posters", "order": 1})
    assert r.status_code == 200

    listed = (await other.get("/api/templates")).json()
    assert design["id"] in [t["id"] for t in listed["templates"]]
    assert "posters" in listed["categories"]
    assert (await other.get("/api/templates", params={"category": "Nope"})).json()["templates"] == []

    # anyone can read a template and start a design from it
    assert (await other.get(f"/api/designs/{design['id']}")).json()["role"] == "view"
    assert (await other.patch(f"/api/designs/{design['id']}", json={"title": "x"})).status_code == 403
    r = await other.post("/api/designs", json={"template_id": design["id"]})
    assert r.status_code == 200
    assert r.json()["title"] == "Poster"

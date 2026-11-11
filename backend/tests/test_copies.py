import pytest

from app import ratelimit, slots
from app.config import get_settings

BASE = {"x": 0, "y": 0, "width": 400, "height": 100, "rotation": 0, "opacity": 1}
DOC = {
    "pages": [{
        "width": 800, "height": 600, "background": {"type": "solid", "color": "#fff"},
        "elements": [
            {**BASE, "type": "text", "slot": "name", "text": "Your name", "fontSize": 40},
            # older documents name the slot `key`
            {**BASE, "type": "text", "key": "role", "text": "Role"},
            {**BASE, "type": "text", "text": "Static"},
            {**BASE, "type": "image", "slot": "photo", "src": "/media/x.png", "naturalWidth": 10,
             "naturalHeight": 10, "placeholder": True},
            {**BASE, "type": "svg", "kind": "qr", "slot": "link", "svg": "<svg/>",
             "qr": {"value": "https://a.example", "fg": "#000", "bg": "#fff", "level": "M"}},
        ],
    }],
    "settings": {},
}


@pytest.fixture
async def source(user):
    r = await user.post("/api/designs", json={"title": "Badge", "doc": DOC})
    return r.json()


def _texts(doc):
    return [e.get("text") for e in doc["pages"][0]["elements"] if e["type"] == "text"]


def _one(values, **extra):
    return {"rows": [values], **extra}


async def test_slots(user, source):
    r = await user.get(f"/api/designs/{source['id']}/slots")
    assert r.json()["slots"] == [{"name": "name", "type": "text"}, {"name": "role", "type": "text"},
                                 {"name": "photo", "type": "image"}, {"name": "link", "type": "qr"}]


async def test_single_copy(user, source):
    ratelimit._counts.clear()
    r = await user.post(f"/api/designs/{source['id']}/copies",
                        json=_one({"name": "Ada", "role": 42, "missing": "x", "link": "https://b.example"},
                                  title="Ada badge"))
    assert r.status_code == 200, r.text
    made = r.json()["made"]
    assert len(made) == 1 and made[0]["id"] != source["id"] and made[0]["title"] == "Ada badge"

    doc = (await user.get(f"/api/designs/{made[0]['id']}")).json()["doc"]
    assert _texts(doc) == ["Ada", "42", "Static"]
    qr = doc["pages"][0]["elements"][4]
    assert qr["qr"]["value"] == "https://b.example" and qr["qr"]["fg"] == "#000"
    # the original is untouched
    assert _texts((await user.get(f"/api/designs/{source['id']}")).json()["doc"])[0] == "Your name"


async def test_copy_with_own_media(user, source):
    r = await user.post(f"/api/designs/{source['id']}/copies", json=_one({"photo": "/media/uploads/a.png"}))
    doc = (await user.get(f"/api/designs/{r.json()['made'][0]['id']}")).json()["doc"]
    img = doc["pages"][0]["elements"][3]
    assert img["src"] == "/media/uploads/a.png" and "placeholder" not in img


async def test_bad_photo_links(user, source, monkeypatch):
    monkeypatch.setattr(get_settings(), "remote_images", True)
    r = await user.post(f"/api/designs/{source['id']}/copies", json=_one({"photo": "http://insecure.example/a.png"}))
    assert r.status_code == 400 and "https://" in r.json()["detail"]
    monkeypatch.setattr(get_settings(), "remote_images", False)
    r = await user.post(f"/api/designs/{source['id']}/copies", json=_one({"photo": "https://a.example/a.png"}))
    assert r.status_code == 400 and "REMOTE_IMAGES" in r.json()["detail"]
    r = await user.post(f"/api/designs/{source['id']}/copies", json=_one({"name": {"nested": 1}}))
    assert r.status_code == 400


async def test_access(make_user, user, source):
    other = await make_user("Other")
    assert (await other.post(f"/api/designs/{source['id']}/copies", json=_one({}))).status_code == 404
    link = (await user.post(f"/api/designs/{source['id']}/links", json={"role": "view"})).json()
    h = {"x-share-token": link["token"]}
    assert (await other.post(f"/api/designs/{source['id']}/copies", json=_one({}), headers=h)).status_code == 403
    link = (await user.post(f"/api/designs/{source['id']}/links", json={"role": "edit"})).json()
    h = {"x-share-token": link["token"]}
    r = await other.post(f"/api/designs/{source['id']}/copies", json=_one({"name": "Mine"}), headers=h)
    assert r.status_code == 200
    # the copy belongs to whoever made it
    new_id = r.json()["made"][0]["id"]
    assert new_id in [d["id"] for d in (await other.get("/api/designs")).json()["designs"]]


async def test_many_rows(user, source):
    ratelimit._counts.clear()
    rows = [{"name": "Ada", "role": "Engineer"}, {"name": "Grace"}, "not a row",
            {"name": "Bad", "photo": "ftp://x"}]
    r = await user.post(f"/api/designs/{source['id']}/copies", json={"rows": rows, "title_from": "name"})
    assert r.status_code == 422  # rows must be objects

    rows = [{"name": "Ada", "role": "Engineer"}, {"name": "Grace"}, {"name": "Bad", "photo": "ftp://x"}, {}]
    r = await user.post(f"/api/designs/{source['id']}/copies", json={"rows": rows, "title_from": "name"})
    assert r.status_code == 200
    out = r.json()
    assert [d["title"] for d in out["made"]] == ["Ada", "Grace", "Badge 4"]
    assert [e["row"] for e in out["failed"]] == [2]

    doc = (await user.get(f"/api/designs/{out['made'][1]['id']}")).json()["doc"]
    assert _texts(doc) == ["Grace", "Role", "Static"]


async def test_row_limits(user, source, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "copies_per_request", 3)
    r = await user.post(f"/api/designs/{source['id']}/copies", json={"rows": [{}] * 4})
    assert r.status_code == 400

    ratelimit._counts.clear()
    monkeypatch.setattr(s, "rate_limit_copies", "2/minute")
    rows = [{"name": str(i)} for i in range(3)]
    r = await user.post(f"/api/designs/{source['id']}/copies", json={"rows": rows})
    out = r.json()
    assert len(out["made"]) == 2
    assert out["failed"][0]["row"] == 2 and "a minute" in out["failed"][0]["reason"]
    ratelimit._counts.clear()


async def test_copy_from_starter(make_user, user, source):
    from tests.conftest import make_admin

    await make_admin(user)
    await user.put(f"/api/designs/{source['id']}/template", json={"is_template": True})
    other = await make_user("Templater")
    r = await other.post(f"/api/designs/{source['id']}/copies", json=_one({"name": "T"}))
    assert r.status_code == 200


def test_cover_crop():
    assert slots._cover_crop(100, 100, 200, 100) == {"x": 50, "y": 0, "width": 100, "height": 100}
    assert slots._cover_crop(200, 100, 100, 100) == {"x": 0, "y": 25, "width": 100, "height": 50}

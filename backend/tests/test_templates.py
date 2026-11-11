import json

from sqlalchemy import select

from app import storage
from app.content import templates
from app.db import SessionLocal
from app.models import Design
from tests.conftest import make_admin


def _write(folder, name, title, src=""):
    el = {"id": "img1", "type": "image", "x": 0, "y": 0, "width": 10, "height": 10, "rotation": 0,
          "opacity": 1, "src": src, "naturalWidth": 10, "naturalHeight": 10, "key": "photo"}
    page = {"id": "p1", "width": 100, "height": 100, "background": {"type": "solid", "color": "#fff"},
            "elements": [el]}
    data = {"title": title, "category": "social", "order": 1, "doc": {"pages": [page], "settings": {}}}
    (folder / name).write_text(json.dumps(data))


async def _builtin() -> dict[str, Design]:
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(Design).where(Design.is_template.is_(True), Design.owner_id.is_(None))
        )).scalars().all()
    return {d.title: d for d in rows}


async def test_seed_copies_images_and_drops_old_templates(tmp_path, monkeypatch, user, design):
    tpl_dir, img_dir = tmp_path / "templates", tmp_path / "images"
    tpl_dir.mkdir()
    img_dir.mkdir()
    monkeypatch.setattr(templates, "TEMPLATE_DIR", tpl_dir)
    monkeypatch.setattr(templates, "IMAGE_DIR", img_dir)
    (img_dir / "photo.jpg").write_bytes(b"jpeg bytes")
    _write(tpl_dir, "a.json", "Seed test A", "asset:photo.jpg")
    _write(tpl_dir, "b.json", "Seed test B")

    async with SessionLocal() as db:
        await templates.seed_templates(db)
    rows = await _builtin()
    assert {"Seed test A", "Seed test B"} <= set(rows)
    src = rows["Seed test A"].doc["pages"][0]["elements"][0]["src"]
    assert src == storage.url_for("templates/photo.jpg")
    assert await storage.read("templates/photo.jpg") == b"jpeg bytes"

    # an admin's own template has an owner and must survive
    await make_admin(user)
    r = await user.put(f"/api/designs/{design['id']}/template", json={"is_template": True, "category": "x"})
    assert r.status_code == 200

    (tpl_dir / "b.json").unlink()
    async with SessionLocal() as db:
        await templates.seed_templates(db)
    rows = await _builtin()
    assert "Seed test A" in rows
    assert "Seed test B" not in rows
    listed = (await user.get("/api/templates")).json()["templates"]
    assert design["id"] in [t["id"] for t in listed]


async def test_shipped_templates_are_valid():
    files = templates.load_files()
    assert len(files) == 12
    for data in files:
        assert data["category"] in {"social", "document", "marketing", "print", "presentation"}
        for page in data["doc"]["pages"]:
            ids = [el["id"] for el in page["elements"]]
            assert len(ids) == len(set(ids)), data["title"]
            for el in page["elements"]:
                src = el.get("src") or ""
                if src.startswith(templates.ASSET_PREFIX):
                    assert (templates.IMAGE_DIR / src[len(templates.ASSET_PREFIX):]).is_file(), src

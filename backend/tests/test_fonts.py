import pytest

from app import storage
from app.content import font_catalog
from app.content.fonts import BY_FAMILY, FONTS
from app.db import SessionLocal
from app.models import Font


def test_bundled_fonts_have_their_license_text():
    for font in FONTS:
        folder = font_catalog.FILES / font.fontsource_id
        assert list(folder.glob("*.woff2")), font.family
        notice = (folder / "LICENSE.txt").read_text()
        marker = "SIL OPEN FONT LICENSE" if font.license == "OFL-1.1" else "Apache License"
        assert marker in notice, font.family
    assert BY_FAMILY["Roboto Mono"].license == "OFL-1.1"


async def test_seed_refreshes_the_license_and_serves_its_notice(tmp_path, monkeypatch, anon):
    font = BY_FAMILY["Roboto Mono"]
    source = font_catalog.FILES / font.fontsource_id
    notice = (source / "LICENSE.txt").read_bytes()
    data = (source / "latin-400-normal.woff2").read_bytes()
    folder = tmp_path / font.fontsource_id
    folder.mkdir()
    (folder / "LICENSE.txt").write_bytes(notice)
    (folder / "latin-400-normal.woff2").write_bytes(data)
    monkeypatch.setattr(font_catalog, "FILES", tmp_path)
    monkeypatch.setattr(font_catalog, "FONTS", [font])

    async with SessionLocal() as db:
        db.add(Font(owner_id=None, family=font.family, category=font.category, license="Apache-2.0", files=[]))
        await db.commit()
        assert await font_catalog.seed_fonts(db) == 1

    response = await anon.get("/api/fonts/catalog")
    row = next(f for f in response.json()["fonts"] if f["family"] == font.family)
    assert row["license"] == "OFL-1.1"
    assert row["license_url"] == storage.url_for("fonts/catalog/roboto-mono/LICENSE.txt")
    response = await anon.get(row["license_url"])
    assert response.status_code == 200
    assert response.content == notice
    assert await storage.read("fonts/catalog/roboto-mono/latin-400-normal.woff2") == data


async def test_seed_rejects_a_font_without_its_notice(tmp_path, monkeypatch):
    font = BY_FAMILY["Inter"]
    folder = tmp_path / font.fontsource_id
    folder.mkdir()
    (folder / "latin-400-normal.woff2").write_bytes(b"wOF2")
    monkeypatch.setattr(font_catalog, "FILES", tmp_path)
    monkeypatch.setattr(font_catalog, "FONTS", [font])
    async with SessionLocal() as db:
        with pytest.raises(FileNotFoundError):
            await font_catalog.seed_fonts(db)

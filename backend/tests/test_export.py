from app.access import snapshot_token
from app.config import get_settings


async def test_export_off_by_default(user, design):
    r = await user.post(f"/api/designs/{design['id']}/export", json={"format": "png"})
    assert r.status_code == 501
    assert "HEADLESS_EXPORT" in r.json()["detail"]


async def test_export_validates(user, design, monkeypatch):
    monkeypatch.setattr(get_settings(), "headless_export", True)
    r = await user.post(f"/api/designs/{design['id']}/export", json={"format": "gif"})
    assert r.status_code == 422
    r = await user.post(f"/api/designs/{design['id']}/export", json={"format": "png", "page": 5})
    assert r.status_code == 400


async def test_snapshot_token_grants_view(anon, design):
    did = design["id"]
    assert (await anon.get(f"/api/designs/{did}")).status_code == 404
    tok = snapshot_token(did)
    r = await anon.get(f"/api/designs/{did}", params={"snapshot": tok})
    assert r.status_code == 200 and r.json()["role"] == "view"
    assert (await anon.get(f"/api/designs/{did}/state", headers={"x-snapshot-token": tok})).status_code == 200
    # only for that design, and only to look
    assert (await anon.patch(f"/api/designs/{did}", json={"title": "x"}, params={"snapshot": tok})).status_code == 403
    assert (await anon.get(f"/api/designs/{did}", params={"snapshot": snapshot_token("other")})).status_code == 404

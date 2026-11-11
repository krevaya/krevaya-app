import json

import pytest

from app import docmodel, ratelimit
from app.config import get_settings

PV = "2025-06-18"


class Mcp:
    def __init__(self, client, token):
        self.c = client
        self.h = {"authorization": f"Bearer {token}", "accept": "application/json, text/event-stream",
                  "content-type": "application/json", "mcp-protocol-version": PV}
        self.n = 0

    async def rpc(self, method, params=None, headers=None):
        self.n += 1
        body = {"jsonrpc": "2.0", "id": self.n, "method": method, "params": params or {}}
        return await self.c.post("/mcp", json=body, headers={**self.h, **(headers or {})})

    async def call(self, name, **args):
        r = await self.rpc("tools/call", {"name": name, "arguments": args})
        assert r.status_code == 200, r.text
        result = r.json()["result"]
        text = result["content"][0]["text"] if result["content"] else ""
        if result.get("isError"):
            raise AssertionError(text)
        return json.loads(text)

    async def error(self, name, **args):
        r = await self.rpc("tools/call", {"name": name, "arguments": args})
        result = r.json()["result"]
        assert result["isError"], result
        return result["content"][0]["text"]


@pytest.fixture
async def m(user, mcp_running):
    ratelimit._counts.clear()
    tok = (await user.post("/api/tokens", json={"name": "mcp"})).json()["token"]
    return Mcp(user, tok)


async def _doc(user, did):
    return docmodel.state_to_json((await user.get(f"/api/designs/{did}/state")).content)


async def test_auth_required(anon, mcp_running):
    r = await anon.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert r.status_code == 401
    r = await anon.post("/mcp", json={}, headers={"authorization": "Bearer ka_wrong"})
    assert r.status_code == 401


async def test_initialize_and_list(m):
    r = await m.rpc("initialize", {"protocolVersion": PV, "capabilities": {},
                                   "clientInfo": {"name": "test", "version": "1"}})
    assert r.status_code == 200
    r = await m.rpc("tools/list")
    names = {t["name"] for t in r.json()["result"]["tools"]}
    assert names == {"design_search", "design_read", "design_new", "element_add", "element_edit",
                     "element_remove", "page_add", "page_background", "starter_list", "design_copy",
                     "design_copies", "design_retitle", "design_link"}


async def test_build_a_design(m, user):
    d = await m.call("design_new", title="Flyer", width=600, height=400)
    did = d["id"]
    assert d["url"].endswith(f"/design/{did}")

    el = await m.call("element_add", design_id=did, page_index=0,
                      element={"type": "text", "text": "Hello", "slot": "headline", "fontSize": 48})
    shape = await m.call("element_add", design_id=did, page_index=0,
                         element=json.dumps({"type": "shape", "fill": "#ff0000", "x": 10, "y": 10}))
    await m.call("element_edit", design_id=did, element_id=el["id"], patch={"text": "Hi there", "slot": None})
    await m.call("element_remove", design_id=did, element_id=shape["id"])
    page = await m.call("page_add", design_id=did, background="#000000")
    assert page["index"] == 1
    await m.call("page_background", design_id=did, page_index=0,
                 background={"type": "linear", "angle": 90, "stops": [{"offset": 0, "color": "#fff"},
                                                                       {"offset": 1, "color": "#000"}]})
    await m.call("design_retitle", design_id=did, title="Better flyer")

    doc = await _doc(user, did)
    assert len(doc["pages"]) == 2
    els = doc["pages"][0]["elements"]
    assert len(els) == 1
    assert els[0]["text"] == "Hi there" and "slot" not in els[0] and els[0]["fontFamily"] == "Inter"
    assert doc["pages"][0]["background"]["type"] == "linear"
    assert doc["pages"][1]["background"] == {"type": "solid", "color": "#000000"}

    got = await m.call("design_read", design_id=did)
    assert got["title"] == "Better flyer"
    assert got["pages"][0]["elements"][0]["id"] == el["id"]
    listed = await m.call("design_search")
    assert did in [x["id"] for x in listed["designs"]]
    assert (await m.call("design_link", design_id=did))["url"] == d["url"]


async def test_create_with_pages_and_copy(m, user):
    d = await m.call("design_new", title="Card", pages=[
        {"width": 500, "height": 300, "background": "#eeeeee",
         "elements": [{"type": "text", "text": "Name", "slot": "name"}]},
    ])
    out = await m.call("design_copy", design_id=d["id"], values={"name": "Ada"}, title="Ada card")
    doc = await _doc(user, out["id"])
    assert doc["pages"][0]["elements"][0]["text"] == "Ada"

    bulk = await m.call("design_copies", design_id=d["id"], rows=[{"name": "A"}, {"name": "B"}], title_from="name")
    assert [x["title"] for x in bulk["made"]] == ["A", "B"] and bulk["failed"] == []


async def test_errors_and_access(m, make_user):
    assert "type has to be" in await m.error("design_new", pages=[{"elements": [{"type": "video"}]}])
    d = await m.call("design_new")
    assert "No element" in await m.error("element_edit", design_id=d["id"], element_id="nope", patch={"x": 1})
    assert "page_index" in await m.error("element_add", design_id=d["id"], page_index=3,
                                         element={"type": "text", "text": "x"})
    assert "number" in await m.error("element_add", design_id=d["id"], page_index=0,
                                     element={"type": "text", "x": "left"})
    assert "scripts" in await m.error("element_add", design_id=d["id"], page_index=0,
                                      element={"type": "svg", "svg": "<svg><script>x</script></svg>"})

    other = await make_user("Other")
    r = await other.post("/api/designs", json={"title": "Private"})
    assert "not found" in await m.error("design_read", design_id=r.json()["id"])
    assert "not found" in await m.error("design_retitle", design_id=r.json()["id"], title="x")


async def test_rate_limit(m, monkeypatch):
    monkeypatch.setattr(get_settings(), "assistant_rate", "2/minute")
    ratelimit._counts.clear()
    # listing tools doesn't count, calling them does
    assert [(await m.rpc("tools/list")).status_code for _ in range(3)] == [200, 200, 200]
    call = {"name": "design_search", "arguments": {}}
    codes = [(await m.rpc("tools/call", call)).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    ratelimit._counts.clear()

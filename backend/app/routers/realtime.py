"""Websocket for live editing. Speaks the y-websocket wire format.

    message   = varuint type, payload
    type 0    sync: varuint step, varbytes data
                step 0  the client's state vector, we answer with step 1 (the diff)
                step 1  a diff (answer to our step 0)
                step 2  an incremental update
    type 1    awareness (cursors, names), relayed untouched
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.requests import Request

from ..access import ROLES, load_design, share_token
from ..db import SessionLocal
from ..deps import optional_user
from ..hub import hub

log = logging.getLogger(__name__)
router = APIRouter()

MSG_SYNC, MSG_AWARENESS = 0, 1
STEP1, STEP2, UPDATE = 0, 1, 2


def write_varuint(n: int) -> bytes:
    out = bytearray()
    while n > 0x7F:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)


def write_varbytes(b: bytes) -> bytes:
    return write_varuint(len(b)) + b


class Reader:
    def __init__(self, data: bytes):
        self.data, self.pos = data, 0

    def varuint(self) -> int:
        n, shift = 0, 0
        while True:
            byte = self.data[self.pos]
            self.pos += 1
            n |= (byte & 0x7F) << shift
            if byte < 0x80:
                return n
            shift += 7

    def varbytes(self) -> bytes:
        size = self.varuint()
        chunk = self.data[self.pos:self.pos + size]
        self.pos += size
        return chunk


def sync_message(step: int, payload: bytes) -> bytes:
    return write_varuint(MSG_SYNC) + write_varuint(step) + write_varbytes(payload)


def awareness_clients(message: bytes) -> dict[int, int]:
    """client id -> clock for every entry in an awareness message."""
    r = Reader(message)
    r.varuint()  # message type
    body = Reader(r.varbytes())
    out = {}
    for _ in range(body.varuint()):
        client, clock = body.varuint(), body.varuint()
        body.varbytes()  # state json
        out[client] = clock
    return out


def awareness_gone(clients: dict[int, int]) -> bytes:
    """An awareness update that tells everyone these clients left."""
    body = write_varuint(len(clients))
    for client, clock in clients.items():
        body += write_varuint(client) + write_varuint(clock + 1) + write_varbytes(b"null")
    return write_varuint(MSG_AWARENESS) + write_varbytes(body)


class Peer:
    def __init__(self, ws: WebSocket, can_edit: bool, link: str = ""):
        self.ws = ws
        self.can_edit = can_edit
        # share link token this peer came in with, so turning the link off can drop them
        self.link = link
        # Last awareness message this peer sent, replayed to people who join later.
        self.awareness: bytes | None = None
        self.clients: dict[int, int] = {}

    async def send_update(self, update: bytes) -> None:
        await self.ws.send_bytes(sync_message(UPDATE, update))

    async def send_raw(self, message: bytes) -> None:
        await self.ws.send_bytes(message)


@router.websocket("/ws/designs/{design_id}")
async def design_socket(ws: WebSocket, design_id: str):
    # Reuse the HTTP auth: cookie session, or ?share=<token> for share links.
    # Request() only accepts http scopes, so hand it a copy that says so.
    request = Request({**ws.scope, "type": "http"})
    async with SessionLocal() as db:
        try:
            user = await optional_user(request, db)
            _, role = await load_design(db, design_id, user, request, "view")
        except Exception:
            await ws.close(code=4403)
            return
    author = user.id if user else None
    await ws.accept()
    room = await hub.room(design_id)
    peer = Peer(ws, ROLES[role] >= ROLES["edit"], "" if role == "owner" else share_token(request))
    room.peers.add(peer)
    try:
        # Open with our state vector so the client sends whatever we're missing.
        async with room.lock:
            sv = room.doc.get_state()
        await ws.send_bytes(sync_message(STEP1, sv))
        for other in list(room.peers):
            if other is not peer and other.awareness:
                await ws.send_bytes(other.awareness)
        while True:
            data = await ws.receive_bytes()
            r = Reader(data)
            kind = r.varuint()
            if kind == MSG_SYNC:
                step = r.varuint()
                payload = r.varbytes()
                if step == STEP1:
                    async with room.lock:
                        diff = room.doc.get_update(payload)
                    await ws.send_bytes(sync_message(STEP2, diff))
                elif step in (STEP2, UPDATE) and peer.can_edit:
                    await room.apply(payload, origin=peer, author=author)
            elif kind == MSG_AWARENESS:
                try:
                    peer.clients.update(awareness_clients(data))
                except IndexError:
                    continue
                peer.awareness = data
                await room.broadcast_raw(data, skip=peer)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket for %s closed with an error", design_id)
    finally:
        room.peers.discard(peer)
        if peer.clients:
            await room.broadcast_raw(awareness_gone(peer.clients))
        if not room.peers:
            await room.flush()

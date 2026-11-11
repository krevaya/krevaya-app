"""Live documents.

Every change to a design, from the editor's websocket, a plain HTTP save or the
assistant, goes through the room for that design. The room keeps the Yjs doc in
memory while anyone is using it, relays updates to the other people in it and
writes the state back to the database a moment after the last change.

Rooms live in this process, so run the API as a single worker (the default
compose file does). Uvicorn handles plenty of concurrent editors that way.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from pycrdt import Doc
from sqlalchemy import delete, select

from . import docmodel
from .db import SessionLocal
from .models import Design, DesignVersion

log = logging.getLogger(__name__)

SAVE_DELAY = 1.5
AUTO_VERSION_EVERY = timedelta(minutes=10)
AUTO_VERSIONS_KEPT = 50


class Room:
    def __init__(self, design_id: str, doc: Doc):
        self.design_id = design_id
        self.doc = doc
        self.lock = asyncio.Lock()
        self.peers: set = set()
        self.dirty = False
        self.save_task: asyncio.Task | None = None
        self.last_author: str | None = None
        self.idle_since = datetime.now(UTC)

    async def apply(self, update: bytes, origin=None, author: str | None = None) -> None:
        async with self.lock:
            self.doc.apply_update(update)
            self.dirty = True
            self.last_author = author or self.last_author
        await self.broadcast_update(update, skip=origin)
        self.schedule_save()

    async def broadcast_update(self, update: bytes, skip=None) -> None:
        for peer in list(self.peers):
            if peer is skip:
                continue
            try:
                await peer.send_update(update)
            except Exception:
                self.peers.discard(peer)

    async def broadcast_raw(self, message: bytes, skip=None) -> None:
        for peer in list(self.peers):
            if peer is skip:
                continue
            try:
                await peer.send_raw(message)
            except Exception:
                self.peers.discard(peer)

    def schedule_save(self) -> None:
        if self.save_task is None or self.save_task.done():
            self.save_task = asyncio.create_task(self._save_later())

    async def _save_later(self) -> None:
        await asyncio.sleep(SAVE_DELAY)
        await self.flush()

    async def flush(self) -> None:
        if not self.dirty:
            return
        async with self.lock:
            state = self.doc.get_update()
            data = docmodel.to_json(self.doc)
            self.dirty = False
        try:
            await persist(self.design_id, state, data, self.last_author)
        except Exception:
            log.exception("saving design %s failed", self.design_id)
            self.dirty = True


async def persist(design_id: str, state: bytes, data: dict, author: str | None) -> None:
    w, h, n = docmodel.summary(data)
    async with SessionLocal() as db:
        design = await db.get(Design, design_id)
        if design is None:
            return
        design.ystate = state
        design.doc = data
        design.width, design.height, design.page_count = w, h, n
        design.updated_at = datetime.now(UTC)
        last = (await db.execute(
            select(DesignVersion.created_at).where(DesignVersion.design_id == design_id)
            .order_by(DesignVersion.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        if last is None or datetime.now(UTC) - last > AUTO_VERSION_EVERY:
            db.add(DesignVersion(design_id=design_id, author_id=author, auto=True, doc=data, ystate=state))
            await _trim_auto_versions(db, design_id)
        await db.commit()


async def _trim_auto_versions(db, design_id: str) -> None:
    keep = select(DesignVersion.id).where(
        DesignVersion.design_id == design_id, DesignVersion.auto.is_(True)
    ).order_by(DesignVersion.created_at.desc()).limit(AUTO_VERSIONS_KEPT)
    await db.execute(delete(DesignVersion).where(
        DesignVersion.design_id == design_id, DesignVersion.auto.is_(True), DesignVersion.id.not_in(keep)
    ))


class Hub:
    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self._opening: dict[str, asyncio.Lock] = {}

    async def room(self, design_id: str) -> Room:
        room = self.rooms.get(design_id)
        if room is not None:
            return room
        lock = self._opening.setdefault(design_id, asyncio.Lock())
        async with lock:
            room = self.rooms.get(design_id)
            if room is None:
                async with SessionLocal() as db:
                    design = await db.get(Design, design_id)
                    state = design.ystate if design else None
                room = Room(design_id, docmodel.load(state))
                self.rooms[design_id] = room
        return room

    async def state(self, design_id: str) -> bytes:
        room = await self.room(design_id)
        async with room.lock:
            return room.doc.get_update()

    async def edit(self, design_id: str, fn, author: str | None = None) -> dict:
        """Change a design from the server side (API, assistant) and push it to live editors."""
        room = await self.room(design_id)
        async with room.lock:
            before = room.doc.get_state()
            with room.doc.transaction():
                fn(room.doc)
            update = room.doc.get_update(before)
            room.dirty = True
            room.last_author = author or room.last_author
            data = docmodel.to_json(room.doc)
        await room.broadcast_update(update)
        room.schedule_save()
        return data

    async def replace(self, design_id: str, state: bytes, author: str | None = None) -> None:
        """Swap the whole document, e.g. when restoring a version.

        Yjs can't rewind, so this rewrites the pages from the old snapshot as a new
        change on top of the current state. Connected editors get it like any edit.
        """
        target = docmodel.state_to_json(state)

        def rewrite(doc):
            pages = doc.get("pages", type=docmodel.Array)
            settings = doc.get("settings", type=docmodel.Map)
            del pages[0:len(pages)]
            for page in target["pages"]:
                pages.append(docmodel._page_map(page))
            for k in list(settings.keys()):
                del settings[k]
            for k, v in target["settings"].items():
                settings[k] = v

        await self.edit(design_id, rewrite, author)

    async def drop_link(self, design_id: str, token: str) -> None:
        """Disconnect everyone who joined through a share link that was just turned off."""
        room = self.rooms.get(design_id)
        if room is None or not token:
            return
        for peer in list(room.peers):
            if getattr(peer, "link", "") == token:
                try:
                    await peer.ws.close(code=4403)
                except Exception:
                    room.peers.discard(peer)

    def forget(self, design_id: str) -> None:
        room = self.rooms.get(design_id)
        if room and not room.peers:
            self.rooms.pop(design_id, None)

    async def flush_all(self) -> None:
        for room in list(self.rooms.values()):
            await room.flush()

    async def reaper(self) -> None:
        """Drop rooms nobody has touched for a while so memory doesn't grow forever."""
        while True:
            await asyncio.sleep(60)
            now = datetime.now(UTC)
            for design_id, room in list(self.rooms.items()):
                if room.peers:
                    room.idle_since = now
                    continue
                if now - room.idle_since > timedelta(minutes=5):
                    await room.flush()
                    if not room.peers and not room.dirty:
                        self.rooms.pop(design_id, None)


hub = Hub()

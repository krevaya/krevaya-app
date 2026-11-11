# How it works

## Layout

```
backend/            FastAPI app
  app/main.py         app factory, routers, /media, /mcp, /admin
  app/models.py       SQLAlchemy models
  app/docmodel.py     the design document in Yjs (pycrdt) <-> JSON
  app/hub.py          live rooms: one in-memory doc per open design
  app/routers/        auth, oauth, tokens, designs, copies, export, assets, sharing, library, realtime
  app/slots.py        copies with new slot values, shared by the API and MCP
  app/mcp_server.py   the MCP tools
  app/content/        starter templates and the font catalog
  migrations/         Alembic
  tests/
frontend/           React app
  src/doc/            document schema, the Yjs-backed store, element factories, formats
  src/render/         Konva renderer, shapes, text layout, filters, asset loading
  src/editor/         canvas engine, header, footer, pane tabs, sidebar/ panes, actions, shortcuts
  src/features/       self-contained features (export, photos, collab, elements) that register themselves
  src/motion/         animations, transitions, present mode
  src/audio/          synthesised music and sound effects, mixing
  src/export/         PNG/JPG, SVG, PDF, video and GIF
  src/persistence/    guest storage (IndexedDB) and server sessions
ops/                host nginx config and systemd unit for installs without containers
```

## The design document

A design is a list of pages, each with a size, a background and a list of elements (text, shape, line,
image, svg). `frontend/src/doc/schema.ts` describes every field.

It's stored as a Yjs document, so several people can edit at once and edits merge. The browser and the server
use the same layout; `backend/app/docmodel.py` is the server's half. The database keeps the Yjs state plus a
plain JSON copy that the API, thumbnails and assistants read.

In the browser, `DocStore` wraps the Yjs doc and hands React a plain snapshot that keeps the same object for
anything that didn't change, so only what changed re-renders. Undo and redo come from Yjs's undo manager
and only cover your own edits.

## Saving and live editing

- Guests: the Yjs state is saved to IndexedDB on every change. Uploaded photos are stored there as blobs
  and referenced as `local:<id>`. Signing up offers to upload everything and move the designs over.
- Signed in: the editor opens a websocket to `/ws/designs/<id>` (the y-websocket protocol). The server keeps
  one room per open design, relays updates and cursors between people, and writes the state to the database
  a moment after the last change. It also keeps an automatic version every ten minutes of editing. If the
  socket can't connect, edits go over plain HTTP instead.
- Edits made by the API or an assistant go through the same room, so they show up live.

## Drawing

Everything is drawn by one renderer, `frontend/src/render/konva.ts`: the editor canvas, thumbnails, PNG
and PDF export, present mode and video frames. Animations are a function from (element, time) to a small
set of changes (opacity, offset, scale, rotation, blur, clip) that the renderer applies, which is how the
same animation looks identical in the editor preview, present mode and an exported MP4.

SVG export is the exception: it writes SVG from the document directly, using Konva's text layout so line
breaks match.

## Local development

You need Python 3.12+, Node 22+ and [uv](https://docs.astral.sh/uv/).

```bash
make install           # backend venv, npm install, .env
make server            # API on http://localhost:8000, SQLite in backend/data
make client            # vite on http://localhost:5173, forwards /api and /ws to the server
make starter-content   # templates and fonts
```

Prefer Postgres while developing? `docker compose --profile dev up -d localdb` starts one on
127.0.0.1:5432 (user, password and database are all `krevaya`).

Checks:

```bash
make check           # pytest, TypeScript and the frontend unit tests
make style           # ruff + TypeScript
make browser-check   # Playwright
```

## Tests

- **Backend:** pytest, in `backend/tests/`. `cd backend && .venv/bin/python -m pytest`.
- **Frontend unit tests:** vitest, next to the code as `src/**/*.test.ts`. They cover the pure parts: shape
  paths, geometry, the document store, resizing, animation timing, page ranges and CSV parsing.
  `cd frontend && npm test` (or `npx vitest` to keep it watching).
- **Browser tests:** Playwright, in `frontend/e2e/`. `make browser-check` or `cd frontend && npm run e2e`;
  `npm run e2e:ui` opens Playwright's UI to run and debug one test at a time. Each run starts its own API on a
  throwaway SQLite database (`e2e/start-api.sh`, seeded with the templates and fonts, assistant API on) and a Vite dev
  server, both on free ports, so it doesn't touch your dev data. It uses your installed Chrome; to use
  Playwright's Chromium instead, run `npx playwright install chromium` once and set `PW_CHANNEL=` (empty).
  The first account on the fresh server becomes the admin, so `accounts.spec.ts` runs before the rest.
  Failures leave a trace and screenshot in `test-results/` and a report in `playwright-report/`
  (`npx playwright show-report`). The dev build exposes the editor store and canvas as `window.__ka` so tests
  can check the document and click elements on the canvas.

GitHub Actions (`.github/workflows/ci.yml`) runs all three on every push and pull request.

## Bundled content

Each family in `backend/app/content/font_files/` has a `LICENSE.txt` from the same Fontsource 5.3.0
package as its fonts. The seed command copies that notice into storage beside the WOFF2 files and
refreshes the catalog's license labels. The font API includes the license and a link to its notice.
The maintainer-only `font_catalog --download` command fetches both from that pinned package version.

`frontend/vite/notices.ts` puts the root license, credits, font notices and installed runtime package
licenses under `/licenses/` in dev and in the build. That includes Iconify data and the photo worker's
dependencies, which aren't all visible as normal JavaScript imports. Missing notices fail the build.
It also packages mediabunny's installed `src/`, license and package metadata in a source zip, so the
matching MPL source ships with the app. Model and icon notices live in `frontend/public/`.

The bundled audio library has exactly five sounds. Their scores are written directly in
`frontend/src/audio/beds.ts` and `cues.ts`, and the browser generates the audio with Web Audio.

| sound | ID | kind |
| --- | --- | --- |
| Slow sketch | `bed:slow-sketch` | music loop |
| Line work | `bed:line-work` | music loop |
| Paper lift | `cue:paper-lift` | short cue |
| Small signal | `cue:small-signal` | short cue |
| Last mark | `cue:last-mark` | short cue |

`frontend/src/audio/builtin.ts` resolves only those exact IDs and rejects any other. Keep them stable
when editing a title or recipe, so saved designs continue to find the sound. The previous 130-sound
catalog has been removed; replace its tracks from the Audio pane when opening an older design.

Adding a setting: read it in `backend/app/config.py`, add it to `.env.example` with a one-line comment, and
mention it in [configuration](configuration.md).

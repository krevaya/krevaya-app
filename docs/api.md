# API and MCP

The editor talks to the server over a JSON API that's open to you as well. Every server publishes its own
reference, with request and response bodies, at `/api/docs`.

## Tokens

Create a personal token in Settings → API tokens (copy it then; it isn't shown again) and send it as a
bearer token:

```bash
curl -H "Authorization: Bearer ka_..." https://krevaya.example.net/api/designs
```

A token acts as you, with your access. Revoke it from the same settings page.

## Slots and copies

A slot is a text box, photo or QR code that's been given a name, so a design can be reused with different
content. In the editor, select it and pick ⋯ → Slot name, then type something like `guest_name` or
`cover_photo`. The copy endpoints make new designs with slot values swapped in and never change the
source. Sources can be your designs, designs shared with you for editing, and starter templates.

See which slots a design has:

```bash
curl -H "Authorization: Bearer ka_..." https://krevaya.example.net/api/designs/<id>/slots
# {"slots": [{"name": "guest_name", "type": "text"}, {"name": "cover_photo", "type": "image"}]}
```

Make copies. `rows` has one object per copy; a single row gives a single copy:

```bash
curl -X POST -H "Authorization: Bearer ka_..." -H "Content-Type: application/json" \
  https://krevaya.example.net/api/designs/<id>/copies \
  -d '{"title_from": "guest_name", "rows": [{"guest_name": "Ana", "table": "4"}, {"guest_name": "Sam", "table": "7"}]}'
# {"made": [{"id": "...", "title": "Ana"}, {"id": "...", "title": "Sam"}], "failed": []}
```

`title_from` picks the slot that names each copy; `title` sets a fixed name instead. With several rows, a
row that can't be used shows up in `failed` with its index and a reason, and the rest are still made. A
single row that fails returns a 400 with the reason.

Slot values:

- text: any string (numbers are fine too)
- photo: an https link. The server downloads it into your uploads, but only when `REMOTE_IMAGES=true`;
  links into the server's own `/media/` always work
- QR code: the text or link to encode

Limits: `COPIES_PER_REQUEST` rows per request (250 unless changed). Each copy counts against
`RATE_LIMIT_COPIES`, and each downloaded photo against `RATE_LIMIT_REMOTE_IMAGES`.

In the editor, File → Copies from a spreadsheet does the same thing from a CSV file or a pasted table.

## Server-side rendering

With [headless export](integrations.md#headless-export) switched on, the server can produce files for you:

```bash
curl -X POST -H "Authorization: Bearer ka_..." -H "Content-Type: application/json" \
  https://krevaya.example.net/api/designs/<id>/export -d '{"format": "png", "page": 0, "scale": 2}' -o page.png
```

`format` is `png`, `jpg` or `pdf` (PDFs include every page). While it's off the endpoint answers 501 and
people export in their browser instead.

## Assistant API (MCP)

`ASSISTANT_API=true` exposes [MCP](https://modelcontextprotocol.io) tools over streamable HTTP at `/mcp`.
Add `https://krevaya.example.net/mcp` to your assistant with an `Authorization: Bearer ka_...` header and
ask in everyday language, for example:

- "Make a square flyer for Saturday's plant swap, olive and cream"
- "Add a slide at the end with our three opening hours"
- "Use the Recipe card starter and fill it in with this week's pasta special"

Tool calls are limited per token by `ASSISTANT_RATE` (60/minute by default); the handshake and listing tools
don't count.

| tool | does |
|---|---|
| `design_search`, `design_read`, `design_link` | find your designs, see what's on each page, get the editor link |
| `design_new`, `design_retitle` | start or rename a design |
| `page_add`, `page_background` | add pages, change their backgrounds |
| `element_add`, `element_edit`, `element_remove` | text, shapes, lines, photos, icons, QR codes |
| `starter_list`, `design_copy`, `design_copies` | starter templates and copies with slot values |

Changes go through the same live room as the editor, so anyone looking at the design sees them arrive.

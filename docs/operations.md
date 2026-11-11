# Running it

## Admin

The first account on a new server is an admin, and so is anyone made with `create-admin`. Admins get:

- `/admin`: users, designs, fonts, extra illustrations and stickers, uploads, share links
- File → Save as template in the editor, to publish any design to the template gallery with a category

## Commands

Run these in `backend/` (or prefix with `docker compose exec server`):

```bash
python -m app.cli migrate                    # bring the database up to date
python -m app.cli create-admin               # asks for email and password
python -m app.cli seed                       # starter templates + font catalog
python -m app.cli seed --only templates      # just one of them
```

`seed` is safe to run again: templates are matched by title and updated, fonts that are already
downloaded are skipped.

## Upgrading

With Docker:

```bash
git pull
docker compose up -d --build
docker compose exec server python -m app.cli seed --only templates   # if the release notes mention new templates
```

Without Docker:

```bash
cd /opt/krevaya-app && sudo -u krevaya git pull
sudo -u krevaya sh -c 'cd backend && uv pip install -r pyproject.toml --extra qr'
sudo -u krevaya sh -c 'cd frontend && npm ci && npm run build'
sudo systemctl restart krevaya-app    # runs migrations first
```

Back up before upgrading. Migrations only move forward.

## Backups

Two things hold your data: the database and the uploads.

```bash
# database
docker compose exec -T postgres pg_dump -U krevaya krevaya | gzip > krevaya-$(date +%F).sql.gz
# uploads, thumbnails, fonts (skip if you use S3, back up the bucket instead)
docker run --rm -v krevaya-app_uploads:/data -v "$PWD":/out alpine tar czf /out/media-$(date +%F).tar.gz -C /data .
```

Compose puts the project folder in front of each volume name, so a clone in `krevaya-app/` gets
`krevaya-app_dbstore` for the database and `krevaya-app_uploads` for files. Check with `docker volume ls`.

Restore by loading the dump into an empty database (`gunzip -c file.sql.gz | docker compose exec -T postgres psql
-U krevaya krevaya`) and unpacking the tarball into the uploads volume.

On SQLite, stop the app and copy `backend/data/` (it holds both the database file and the uploads).

Guest designs live only in the browser that made them. They aren't on the server and aren't in backups;
people who want them kept should create an account, which offers to move them over.

## Troubleshooting

**Everyone gets signed out / "Cross-site request refused".** `SITE_URL` doesn't match the address in the
browser. It has to be the exact scheme, host and port people use.

**Edits save but other people don't see them live.** The websocket isn't getting through. Your proxy must
pass `Upgrade` and `Connection` headers for `/ws/`. The editor keeps saving over plain HTTP when the
socket is down, so nothing is lost, it just isn't live.

**Fonts look wrong or templates overlap.** The font catalog isn't loaded. Run `python -m app.cli seed
--only fonts` and check `/api/fonts/catalog` returns a list.

**Background removal says it isn't set up.** `frontend/public/models/u2netp.onnx` is missing from the
build, usually because the repo was cloned without it. Check the file is there and rebuild the frontend.

**Video export is grayed out.** It needs a browser with WebCodecs (recent Chrome, Edge or Safari). Firefox
support depends on the version.

**Emails don't arrive.** Without `SMTP_HOST` they're printed in the API log instead
(`docker compose logs server`).

**"Too many requests".** A rate limit kicked in. The limits are per IP for sign-in and per user for
everything else; raise them in `.env` if they're too tight for you.

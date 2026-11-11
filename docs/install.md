# Install

Krevaya is one Python process (API plus live editing) and a folder of static files. You can run the
pair in containers with the bundled compose file, or on a plain Linux box with the files in `ops/`.

## Containers

Needs Docker and its compose plugin.

```bash
git clone <this repo> krevaya-app && cd krevaya-app
cp .env.example .env
```

Three values in `.env` need your attention before the first start:

- `SECRET_KEY`: signs cookies and links. Make one with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `POSTGRES_PASSWORD`: any string; only the containers use it
- `SITE_URL`: the address in people's browsers, e.g. `https://krevaya.example.net`

Start everything and load the starter content:

```bash
docker compose up -d --build
docker compose exec server python -m app.cli seed
```

Open <http://localhost:8460> (set `WEB_PORT` in `.env` for another port). The server container applies
database migrations on every start.

`seed` adds the starter templates and copies the bundled fonts (101 families, 428 files) into storage. Run
it once now and again after an upgrade that brings new templates or fonts. It works offline: fonts, icons,
the sound library and the cut-out model are all in the repo.

The first person to sign up becomes the admin. To make an admin from the command line instead:

```bash
docker compose exec server python -m app.cli create-admin
```

Both Dockerfiles use the repository root as their build context, so the images include the credits and
bundled notices. To build one on its own, run `docker build -f frontend/Dockerfile .` or
`docker build -f backend/Dockerfile .` from that root.

The compose file defines:

| service | role |
|---|---|
| `postgres` | PostgreSQL 16, keeping its files on the `dbstore` volume |
| `server` | the FastAPI app, a single worker (see below); uploads in the `uploads` volume |
| `webapp` | nginx serving the built frontend on port 8460 and passing `/api`, `/ws`, `/media`, `/mcp` and `/admin` to `server` |
| `cache` | redis for shared rate limits, only with `--profile cache` |
| `localdb` | a development postgres on 127.0.0.1:5432, only with `--profile dev` |

### TLS

Terminate https in front of `webapp` with whatever you already run (Caddy, Traefik, a cloud load balancer,
host nginx), and let it forward websocket upgrades on `/ws/`. Then switch `SITE_URL` to the https address
and set `COOKIE_SECURE=true`.

## Plain server

Tested on Debian and Ubuntu with Python 3.12+, Node 22+, nginx, [uv](https://docs.astral.sh/uv/) and
PostgreSQL. A small install can stay on the default SQLite file.

```bash
sudo useradd --system --home /opt/krevaya-app krevaya
sudo git clone <this repo> /opt/krevaya-app && sudo chown -R krevaya: /opt/krevaya-app
sudo -u krevaya -s
cd /opt/krevaya-app
cp .env.example .env    # same three values as above, plus DATABASE_URL for postgres

cd backend
uv venv --python 3.12 && uv pip install -r pyproject.toml --extra qr
.venv/bin/python -m app.cli migrate
.venv/bin/python -m app.cli seed

cd ../frontend
npm ci && npm run build    # writes frontend/dist
exit
```

With PostgreSQL, make a database and a user for it and point
`DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/krevaya` at them.

Then hook up systemd and nginx:

```bash
sudo cp /opt/krevaya-app/ops/krevaya-app.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now krevaya-app

sudo cp /opt/krevaya-app/ops/nginx-host.conf /etc/nginx/sites-available/krevaya-app
sudo ln -s /etc/nginx/sites-available/krevaya-app /etc/nginx/sites-enabled/
# put your hostname in server_name, then
sudo nginx -t && sudo systemctl reload nginx
```

The unit migrates the database and starts uvicorn on 127.0.0.1:8000. nginx serves `frontend/dist`, sends
unknown paths to `index.html` so app routes work, and forwards the API paths.

## Cut-out model

"Remove background" runs in the visitor's browser with U²-Netp, a 4.6 MB Apache-2.0 model. The file is
checked in at `frontend/public/models/` and is served with the rest of the frontend, so nothing is fetched
from elsewhere at runtime.

Its source, checksum and full notices are in the same folder. The built app serves all its licenses at
`/licenses/`, linked from Settings. Keep that directory when copying `frontend/dist` to a server.

On an existing install, run `python -m app.cli seed` again after updating. This refreshes the font license
labels and puts each family's notice beside its font files in local storage or S3. In Docker, use
`docker compose exec server python -m app.cli seed`.

## A single worker, on purpose

Each open design lives in the memory of the process its editors are connected to, so every editor of a
design has to reach the same process. One async uvicorn worker copes with plenty of people at once. If you
do split into several processes, set `REDIS_URL` so rate limits are shared and pin each
`/ws/designs/<id>` path to one process.

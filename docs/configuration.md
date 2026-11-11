# Configuration

Krevaya takes all of its settings from environment variables. On start the backend looks at `.env` in
the repo root, then `backend/.env`, then the process environment; the compose file hands the same `.env` to
the server container. [`.env.example`](../.env.example) has every setting with a short note.

Booleans are `true`/`false`. Rate limits are written `count/period`, with period one of `second`,
`minute`, `hour` or `day`.

## Set these first

| setting | default | notes |
|---|---|---|
| `SECRET_KEY` | `dev-only-change-me` | Signs sessions and links. Use a long random value in production; rotating it logs everyone out. |
| `SITE_URL` | `http://localhost:8460` | Where people reach the site, without a slash at the end. Links in emails, share links and sign-in callbacks are built from it. |
| `DATABASE_URL` | SQLite in `backend/data` | For Postgres: `postgresql+asyncpg://user:pass@host:5432/db`. Compose fills it in. |
| `COOKIE_SECURE` | `false` | Turn on as soon as the site runs on https. |
| `ALLOW_SIGNUP` | `true` | `false` closes registration; admins can still create people in `/admin`. |
| `POSTGRES_PASSWORD` | | Compose only: password for the bundled Postgres. |
| `WEB_PORT` | `8460` | Compose only: host port for the webapp container. |

## The rest

| area | settings |
|---|---|
| General | `DEBUG`, `SITE_NAME` |
| Uploads | `DATA_DIR`, `MEDIA_URL`, `UPLOAD_LIMIT_MB` (50) |
| Bucket storage | `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` (see [integrations](integrations.md#bucket-storage)) |
| Sessions | `SESSION_TTL_DAYS` (14) |
| Mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS`, `EMAIL_FROM` |
| Google accounts | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| OpenID Connect | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_LABEL`, `OIDC_SCOPES` |
| Stock search | `UNSPLASH_KEY`, `PEXELS_KEY`, `FREESOUND_KEY` |
| Assistant API (MCP) | `ASSISTANT_API` (off), `ASSISTANT_RATE` (60/minute per token) |
| Copies with new values | `COPIES_PER_REQUEST` (250), `REMOTE_IMAGES` (off) |
| Headless export | `HEADLESS_EXPORT` (off), `HEADLESS_BROWSER_PATH`, `SNAPSHOT_URL` |
| Shared counters | `REDIS_URL` |
| Rate limits | `RATE_LIMIT_LOGIN`, `RATE_LIMIT_UPLOAD`, `RATE_LIMIT_EXPORT`, `RATE_LIMIT_COPIES`, `RATE_LIMIT_REMOTE_IMAGES` |

Nothing contacts an outside service until you add its key or switch it on.

Restart the API after editing `.env`: `docker compose up -d` recreates the container, or use
`sudo systemctl restart krevaya-app` on a plain server.

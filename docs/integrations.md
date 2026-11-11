# Integrations

Each of these is opt-in. Add the settings to `.env`, then restart the API.

## Bucket storage

Uploads, thumbnails and fonts can live in an S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2,
MinIO and similar) rather than the local `uploads` volume. Outside Docker, install the extra first:
`uv pip install -r pyproject.toml --extra s3`. The container image already includes it.

```
S3_BUCKET=krevaya-uploads
S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com   # leave empty on AWS
S3_REGION=auto
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_PUBLIC_URL=https://media.example.net                       # public base URL for objects
```

Browsers load these files straight from `S3_PUBLIC_URL`, and the editor paints them onto a canvas, so the
objects have to be publicly readable and served with a CORS rule that names your site, for example:

```json
[{ "AllowedOrigins": ["https://krevaya.example.net"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
```

Switching an install that already has uploads: sync the files under `media/` in the uploads volume into the
bucket with the same paths, then add the settings. Existing designs keep the `/media/...` addresses they
were saved with, so leave the volume attached as long as old designs still use them.

## Signing in

### Google

1. Create an OAuth client ("Web application") in the Google Cloud console.
2. Give it the redirect URI `<SITE_URL>/api/auth/google/callback`.
3. Put the client id and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The sign-in page then offers Google. Someone signing in this way lands in the account with the same
verified email, or gets a fresh account when `ALLOW_SIGNUP` is on.

### OpenID Connect

Any OIDC provider works: Keycloak, Authentik, Authelia, Okta, Entra ID, Zitadel and so on.

```
OIDC_ISSUER=https://auth.example.net/realms/main
OIDC_CLIENT_ID=krevaya-app
OIDC_CLIENT_SECRET=...        # empty for a public (PKCE) client
OIDC_LABEL=Work account       # text on the sign-in button
```

The redirect URI to register is `<SITE_URL>/api/auth/oidc/callback`, and the issuer is everything before
`/.well-known/openid-configuration`. People are matched to accounts by verified email. If `ALLOW_SIGNUP` is
off, only people who already have an account get in; leave it on to create accounts on first sign-in.

## Stock photos and sounds

```
UNSPLASH_KEY=...    # https://unsplash.com/developers
PEXELS_KEY=...      # https://www.pexels.com/api/
FREESOUND_KEY=...   # https://freesound.org/apiv2/apply/
```

One photo key turns on search in the Photos pane; with both, people can pick the source. The Freesound key
adds a sound search to the Audio pane, CC0 results only by default. Searches go through the server, so the
keys never reach the browser.

## Headless export

`POST /api/designs/<id>/export` returns a PNG, JPG or PDF made on the server, handy for scripts. It runs
Chromium through Playwright, which is heavy, so it stays off unless you ask for it.

```bash
uv pip install -r pyproject.toml --extra export
.venv/bin/playwright install chromium     # or set HEADLESS_BROWSER_PATH to a Chrome you have
```

```
HEADLESS_EXPORT=true
SNAPSHOT_URL=http://webapp:8460   # base URL the server can load the frontend from (compose sets this)
```

For containers, build the server image with the extra and a browser:

```bash
docker compose build --build-arg EXTRAS="s3 redis qr export" --build-arg BROWSER=1 server
docker compose up -d
```

Under the hood the server opens `/snapshot/<id>` on the frontend with a token that expires after five
minutes, waits for it to finish drawing and captures the page.

## Mail

Address confirmation and password resets are sent by email.

```
SMTP_HOST=smtp.example.net
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_TLS=true
EMAIL_FROM=Krevaya <noreply@example.net>
```

Leave `SMTP_HOST` empty while trying things out and the messages are printed to the API log instead.

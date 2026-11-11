#!/usr/bin/env sh
# Starts the API for the browser tests on a throwaway database and data dir.
# Run by playwright.config.ts, which picks E2E_API_PORT and E2E_WEB_PORT.
set -e
cd "$(dirname "$0")/../../backend"
PY="${E2E_PYTHON:-.venv/bin/python}"
dir="$(mktemp -d "${TMPDIR:-/tmp}/ka-e2e.XXXXXX")"
trap 'rm -rf "$dir"' EXIT
trap 'exit 0' INT TERM

export DATA_DIR="$dir"
export DATABASE_URL="sqlite+aiosqlite:///$dir/app.db"
export SITE_URL="http://localhost:${E2E_WEB_PORT:-5173}"
export ASSISTANT_API=true
export ALLOW_SIGNUP=true
export HEADLESS_EXPORT=false
export RATE_LIMIT_LOGIN=1000/minute
export RATE_LIMIT_UPLOAD=1000/minute
export RATE_LIMIT_COPIES=1000/minute

"$PY" -m app.cli migrate
"$PY" -m app.cli seed  # templates, plus the fonts that ship in the repo
"$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${E2E_API_PORT:-8000}" --no-access-log &
wait $!

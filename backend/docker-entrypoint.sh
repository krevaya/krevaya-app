#!/bin/sh
set -e

# bring the schema up to date before serving. SKIP_MIGRATIONS=1 to run them yourself.
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    python -m app.cli migrate
fi

exec "$@"

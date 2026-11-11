# syntax=docker/dockerfile:1
FROM python:3.15-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/data

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv

WORKDIR /app

# space-separated extras from pyproject.toml: s3 redis export qr
ARG EXTRAS="s3 redis qr"
COPY backend/pyproject.toml ./
RUN uv pip install --system -r pyproject.toml $(for e in $EXTRAS; do printf -- '--extra %s ' "$e"; done)

# from the repo root: docker build -f backend/Dockerfile --build-arg EXTRAS="s3 redis qr export" --build-arg BROWSER=1 .
ARG BROWSER=0
RUN if [ "$BROWSER" = "1" ]; then python -m playwright install --with-deps chromium; fi

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY LICENSE CREDITS.md ./
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data \
    && chown app:app /data \
    && chmod +x /usr/local/bin/docker-entrypoint.sh
USER app
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

ENTRYPOINT ["docker-entrypoint.sh"]
# one worker on purpose: live editing rooms live in this process (see app/hub.py)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

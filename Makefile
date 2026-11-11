# Shortcuts for working on Krevaya. First time: `make install`. Day to day, run
# `make server` and `make client` side by side, then open the URL vite prints.
# Targets that talk to the database run on your machine; prefix with IN_DOCKER=1 to run
# them inside the compose server container instead.

VENV_PY := .venv/bin/python
COMPOSE := docker compose
ifdef IN_DOCKER
APP := $(COMPOSE) exec server python
else
APP := cd backend && $(VENV_PY)
endif

.PHONY: install server client db-upgrade check browser-check style format images start stop tail starter-content admin

install:
	cd backend && uv venv --python 3.12 && uv pip install -r pyproject.toml --extra dev --extra qr
	cd frontend && npm install
	@test -f .env || (cp .env.example .env && echo "wrote .env from .env.example")

server:
	cd backend && $(VENV_PY) -m app.cli migrate && $(VENV_PY) -m uvicorn app.main:app --reload --port 8000

client:
	cd frontend && npm run dev

db-upgrade:
	$(APP) -m app.cli migrate

check:
	cd backend && $(VENV_PY) -m pytest
	cd frontend && npx tsc --noEmit && npx vitest run

# Playwright starts its own server and vite on free ports. It drives your installed
# Chrome; set PW_CHANNEL= (empty) after `npx playwright install chromium` to use its own.
browser-check:
	cd frontend && npx playwright test

style:
	cd backend && $(VENV_PY) -m ruff check .
	cd frontend && npx tsc --noEmit

format:
	cd backend && $(VENV_PY) -m ruff check --fix . && $(VENV_PY) -m ruff format .

images:
	$(COMPOSE) build

start:
	$(COMPOSE) up -d --build

stop:
	$(COMPOSE) down

tail:
	$(COMPOSE) logs -f server webapp

starter-content:
	$(APP) -m app.cli seed

admin:
	$(APP) -m app.cli create-admin

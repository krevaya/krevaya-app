# Contributing

Help is welcome, whether that's a bug report, an idea or code.
Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

**Found a bug?** File an issue saying what you tried, what you expected and what you got. Mention your
browser and its version; a screenshot or a tiny design that reproduces it is gold.

**Have an idea?** For anything beyond a small fix, start with an issue so we can settle the direction
before you put in the work.

**Found a vulnerability?** Please keep it out of the public tracker and use GitHub's private vulnerability
reporting for this repository instead. [SECURITY.md](SECURITY.md) has the details.

## Sending changes

- `make install` sets you up; [docs/architecture.md](docs/architecture.md) explains how the pieces connect.
- Aim for one fix or feature per pull request.
- Run `make check` and `make style`. If you touched the editor or the API, run `make browser-check` too.
  More in [Tests](docs/architecture.md#tests).
- Backend tests live in `backend/tests/`, frontend unit tests sit beside the code as `*.test.ts`, browser
  tests are in `frontend/e2e/`. Model changes need an Alembic migration
  (`cd backend && .venv/bin/alembic revision --autogenerate -m "..."`); read it over before committing.
- New settings, outside services or admin steps belong in `.env.example` and the docs, as part of the
  same change.
- Third-party code, fonts, icons and models need a license that works with AGPL-3.0, plus a line in
  `CREDITS.md`. Keep the full license and copyright notices with bundled files. Updating a font or model
  means checking its notice too; a link to the license doesn't replace the text.

Contributions are released under the project's license, AGPL-3.0.

"""The font catalog: the families in fonts.py, with their files in font_files/.

The files are part of the repo, so a new install never has to download fonts
from anywhere. `seed_fonts` copies them into storage (disk or S3) and upserts a
Font row per family. Safe to run again: unchanged fonts are skipped, notices are refreshed.

To refresh the files or add a family, add it to fonts.py and run
`python -m app.content.font_catalog --download` (needs internet, maintainers only).
"""

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import storage
from ..models import Font
from .fonts import FONTS, CatalogFont

FILES = Path(__file__).parent / "font_files"
FONTSOURCE_VERSION = "5.3.0"
SOURCE = f"https://cdn.jsdelivr.net/npm/@fontsource/{{id}}@{FONTSOURCE_VERSION}"


def local_path(font: CatalogFont, weight: int, style: str) -> Path:
    return FILES / font.fontsource_id / f"latin-{weight}-{style}.woff2"


def storage_key(font: CatalogFont, weight: int, style: str) -> str:
    return f"fonts/catalog/{font.fontsource_id}/latin-{weight}-{style}.woff2"


async def seed_fonts(db: AsyncSession, force: bool = False) -> int:
    """What `python -m app.cli seed` calls. Returns how many families are in the catalog."""
    count = 0
    for font in FONTS:
        notice = (FILES / font.fontsource_id / "LICENSE.txt").read_bytes()
        row = (await db.execute(
            select(Font).where(Font.owner_id.is_(None), Font.family == font.family)
        )).scalar_one_or_none()
        have = {(f["weight"], f["style"]): f for f in (row.files if row else [])}
        files = []
        for weight, style in font.styles():
            path = local_path(font, weight, style)
            if not path.exists():
                continue  # the family doesn't come in this weight or style
            entry = have.get((weight, style))
            if entry is None or force:
                url = await storage.save(storage_key(font, weight, style), path.read_bytes(), "font/woff2")
                entry = {"weight": weight, "style": style, "url": url}
            files.append(entry)
        if not files:
            continue
        await storage.save(f"fonts/catalog/{font.fontsource_id}/LICENSE.txt", notice, "text/plain")
        if row is None:
            row = Font(owner_id=None, family=font.family)
            db.add(row)
        row.category = font.category
        row.license = font.license
        row.files = files
        count += 1
    await db.commit()
    return count


async def download(force: bool = False) -> None:
    """Refresh font_files/ from Fontsource. Only for updating the repo."""
    import httpx

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for font in FONTS:
            base = SOURCE.format(id=font.fontsource_id)
            notice_path = FILES / font.fontsource_id / "LICENSE.txt"
            if force or not notice_path.exists():
                notice = await client.get(f"{base}/LICENSE")
                notice.raise_for_status()
                marker = "SIL OPEN FONT LICENSE" if font.license == "OFL-1.1" else "Apache License"
                if marker not in notice.text:
                    raise ValueError(f"Unexpected license for {font.family}; check fonts.py before updating the files")
                notice_path.parent.mkdir(parents=True, exist_ok=True)
                notice_path.write_bytes(notice.content)
            got = 0
            for weight, style in font.styles():
                path = local_path(font, weight, style)
                if path.exists() and not force:
                    got += 1
                    continue
                r = await client.get(f"{base}/files/{font.fontsource_id}-latin-{weight}-{style}.woff2")
                # a weight or italic the family doesn't have comes back as 404
                if r.status_code != 200 or r.content[:4] != b"wOF2":
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(r.content)
                got += 1
            print(f"{font.family}: {got} files")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="update the font files in the repo")
    parser.add_argument("--download", action="store_true", required=True)
    parser.add_argument("--force", action="store_true", help="download files that are already there")
    asyncio.run(download(parser.parse_args().force))

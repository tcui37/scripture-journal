"""Regenerate the frontend's browser-test fixtures (frontend/e2e/fixtures).

Public-domain Berean Standard Bible text from bible.helloao.org (keyless),
run through the real pipeline (`Passages` over `HelloAoSource`), so the
layout tests see exactly what the API would send. Licensed text (ESV, NIV,
CSB…) must never be written here.

    cd backend && .venv/bin/python -m scripts.layout_fixtures
"""

import asyncio
import json
from pathlib import Path

from app.cache import Store
from app.passages import Passages
from app.providers.helloao import HelloAoClient, HelloAoSource

OUT = Path(__file__).resolve().parents[2] / "frontend" / "e2e" / "fixtures"

#: name -> (book, start chapter, start verse, end chapter, end verse)
PASSAGES = {
    # Prose across chapters, with headings and a genealogy.
    "bsb-ruth-1-4": ("RUT", 1, 1, 4, 22),
    # Dense poetry: one block per line in line flow.
    "bsb-lamentations-2": ("LAM", 2, 1, 2, 22),
    # Prose and poetry mixed, a long chapter.
    "bsb-isaiah-40": ("ISA", 40, 1, 40, 31),
    # A partial range across a chapter boundary.
    "bsb-john-3-16-4-14": ("JHN", 3, 16, 4, 14),
}


async def main() -> None:
    client = HelloAoClient(timeout=30)
    passages = Passages(HelloAoSource(client, "BSB"), Store(), namespace="fixtures", ttl=None)
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        for name, (book, sc, sv, ec, ev) in PASSAGES.items():
            passage = await passages.get_passage(book, sc, sv, ec, ev)
            path = OUT / f"{name}.json"
            path.write_text(json.dumps(passage.model_dump(), ensure_ascii=False, indent=1) + "\n")
            verses = sum(1 for p in passage.paragraphs for v in p.verses if v.number)
            print(f"{path.name}: {verses} verses, {len(passage.paragraphs)} paragraphs")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

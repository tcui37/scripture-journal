"""The ESV, from Crossway.

Crossway serves passage text only, so book/chapter/verse structure comes from
the static canon. Their licence caps how much may be shown at once; that is
enforced in the router, which knows the requested size before fetching.
"""

from ...canon import BOOK_NAMES
from ...schemas import Book, Passage
from ..base import (
    build_reference,
    canonical_books,
    canonical_verse_numbers,
    fetch_chapters,
    partial_bounds,
    with_chapter_markers,
)
from .client import EsvClient
from .parser import parse_esv_html

MAX_CONCURRENT_CHAPTERS = 4  # Crossway allows 60 requests a minute

# Crossway requires this notice wherever ESV text appears.
ESV_COPYRIGHT = (
    "Scripture quotations are from the ESV® Bible (The Holy Bible, English "
    "Standard Version®), copyright © 2001 by Crossway, a publishing ministry "
    "of Good News Publishers. Used by permission. All rights reserved."
)

# Crossway also requires every page carrying ESV text to link to esv.org.
ESV_ATTRIBUTION = "https://www.esv.org"


class EsvProvider:
    def __init__(self, client: EsvClient) -> None:
        self._client = client

    async def list_books(self) -> list[Book]:
        return canonical_books()

    async def list_verse_numbers(self, book_id: str, chapter: str) -> list[str]:
        return canonical_verse_numbers(book_id, chapter)

    async def get_passage(
        self, book_id: str, start_chapter: int, start_verse: int, end_chapter: int, end_verse: int
    ) -> Passage:
        name = BOOK_NAMES.get(book_id, book_id)
        chapters = list(range(start_chapter, end_chapter + 1))

        async def fetch(index: int, number: int) -> str:
            first, last = partial_bounds(index, len(chapters), start_verse, end_verse)
            # Crossway wants an explicit range; 999 asks for "to the end".
            query = f"{name} {number}:{first or 1}-{number}:{last or 999}"
            return await self._client.passage_html(query)

        results = await fetch_chapters(chapters, fetch, limit=MAX_CONCURRENT_CHAPTERS)

        return Passage(
            reference=build_reference(book_id, start_chapter, start_verse, end_chapter, end_verse),
            copyright=ESV_COPYRIGHT,
            attribution=ESV_ATTRIBUTION,
            paragraphs=with_chapter_markers(
                chapters, [parse_esv_html(html) for html in results]
            ),
        )

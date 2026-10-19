"""The ESV, from Crossway.

Crossway serves passage text only, so book/chapter/verse structure comes from
the static canon. Their licence caps how much may be shown at once; that is
enforced in the router, which knows the requested size before fetching. Their
terms also forbid storing the text, so the source registry gives the ESV no
cache: every chapter is fetched for the request that shows it.
"""

from ...canon import BOOK_NAMES
from ...schemas import Book
from ..base import ChapterText, canonical_books
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


class EsvSource:
    max_concurrency = MAX_CONCURRENT_CHAPTERS
    attribution = ESV_ATTRIBUTION
    canonical_structure = True

    def __init__(self, client: EsvClient) -> None:
        self._client = client

    async def list_books(self) -> list[Book]:
        return canonical_books()

    async def fetch_chapter(self, book_id: str, chapter: int) -> ChapterText:
        name = BOOK_NAMES.get(book_id, book_id)
        # Crossway wants an explicit range; 999 asks for "to the end". A bare
        # "Jude 1" would be read as a verse of a one-chapter book.
        html = await self._client.passage_html(f"{name} {chapter}:1-{chapter}:999")
        return ChapterText(paragraphs=parse_esv_html(html), copyright=ESV_COPYRIGHT)

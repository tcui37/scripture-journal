"""bible-api.com — plain verse text, no key.

The simplest of the sources: a chapter comes back as a flat list of verses
with no headings, poetry or red letter, so passages render as plain prose.
"""

from typing import Any

from ...canon import BOOK_NAMES
from ...schemas import Book, Paragraph, Segment, Verse
from ..base import ChapterText, canonical_books, chapter_verse_count
from .client import BibleApiClient

MAX_CONCURRENT_CHAPTERS = 4


class BibleApiSource:
    max_concurrency = MAX_CONCURRENT_CHAPTERS
    attribution = ""
    canonical_structure = True

    def __init__(
        self, client: BibleApiClient, translation_id: str, *, new_testament_only: bool = False
    ) -> None:
        self._client = client
        self._translation_id = translation_id
        self._new_testament_only = new_testament_only

    async def list_books(self) -> list[Book]:
        return canonical_books(new_testament_only=self._new_testament_only)

    async def fetch_chapter(self, book_id: str, chapter: int) -> ChapterText:
        name = BOOK_NAMES.get(book_id, book_id)
        # This upstream 404s on an end verse the chapter does not have, so the
        # chapter is closed on its real last verse — or asked for whole, when
        # the canon does not cover the book.
        end = chapter_verse_count(book_id, str(chapter))
        reference = f"{name} {chapter}:1-{end}" if end else f"{name} {chapter}"
        data = await self._client.passage(reference, self._translation_id)
        return ChapterText(paragraphs=_prose(data), copyright=data.get("translation_name") or "")


def _prose(data: dict[str, Any]) -> list[Paragraph]:
    """One chapter's verses as a single prose paragraph.

    This upstream carries no headings, poetry or red letter, so a chapter is
    just a run of verses. Whitespace is normalised because the text arrives
    with the source's own line breaks in it.
    """
    verses = [
        Verse(
            number=str(entry.get("verse")),
            segments=[Segment(text=" ".join(str(entry.get("text", "")).split()))],
        )
        for entry in data.get("verses") or []
        if entry.get("text")
    ]
    return [Paragraph(kind="text", style="p", verses=verses)] if verses else []

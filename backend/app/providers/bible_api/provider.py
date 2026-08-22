"""bible-api.com — plain verse text, no key.

The simplest of the sources: a chapter comes back as a flat list of verses
with no headings, poetry or red letter, so passages render as plain prose.
"""

from typing import Any

from ...canon import BOOK_NAMES
from ...schemas import Book, Paragraph, Passage, Segment, Verse
from ..base import (
    build_reference,
    canonical_books,
    canonical_verse_numbers,
    chapter_verse_count,
    fetch_chapters,
    partial_bounds,
    with_chapter_markers,
)
from .client import BibleApiClient

MAX_CONCURRENT_CHAPTERS = 4


class BibleApiProvider:
    def __init__(
        self, client: BibleApiClient, translation_id: str, *, new_testament_only: bool = False
    ) -> None:
        self._client = client
        self._translation_id = translation_id
        self._new_testament_only = new_testament_only

    async def list_books(self) -> list[Book]:
        return canonical_books(new_testament_only=self._new_testament_only)

    async def list_verse_numbers(self, book_id: str, chapter: str) -> list[str]:
        return canonical_verse_numbers(book_id, chapter)

    async def get_passage(
        self, book_id: str, start_chapter: int, start_verse: int, end_chapter: int, end_verse: int
    ) -> Passage:
        name = BOOK_NAMES.get(book_id, book_id)
        chapters = list(range(start_chapter, end_chapter + 1))

        async def fetch(index: int, number: int) -> dict[str, Any]:
            first, last = partial_bounds(index, len(chapters), start_verse, end_verse)
            # This upstream 404s on an end verse the chapter does not have, so
            # an open-ended chapter is closed on its real last verse — or asked
            # for whole, when the canon does not cover the book.
            end = last or chapter_verse_count(book_id, str(number))
            reference = f"{name} {number}:{first or 1}-{end}" if end else f"{name} {number}"
            return await self._client.passage(reference, self._translation_id)

        results = await fetch_chapters(chapters, fetch, limit=MAX_CONCURRENT_CHAPTERS)

        return Passage(
            reference=build_reference(book_id, start_chapter, start_verse, end_chapter, end_verse),
            copyright=(results[0] if results else {}).get("translation_name") or "",
            paragraphs=with_chapter_markers(chapters, [_prose(data) for data in results]),
        )


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

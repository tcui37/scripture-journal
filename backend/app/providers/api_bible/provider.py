"""api.bible — the richest source, carrying headings, poetry and red letter.

Ranges are fetched one chapter at a time: api.bible's /passages endpoint
silently truncates long requests (ask for John 1:1-21:25 and it returns John
1:1-5:34 with no error), so each chapter is fetched whole and the ends of the
range are trimmed locally.
"""

from typing import Any

from ...canon import short_name
from ...schemas import Book, Chapter, Passage
from ..base import (
    build_reference,
    chapter_verse_count,
    fetch_chapters,
    partial_bounds,
    with_chapter_markers,
)
from .client import ApiBibleClient
from .parser import parse_content, trim_verses

MAX_CONCURRENT_CHAPTERS = 8

# api.bible's terms require a visible citation and a link back to api.bible.
API_BIBLE_ATTRIBUTION = "Scripture provided by API.Bible — https://api.bible"

CHAPTER_PARAMS = {
    "content-type": "json",
    "include-verse-numbers": "true",
    "include-titles": "true",
    "include-chapter-numbers": "false",
    "include-notes": "false",
}


class ApiBibleProvider:
    def __init__(self, client: ApiBibleClient, bible_id: str) -> None:
        self._client = client
        self._bible_id = bible_id

    async def list_books(self) -> list[Book]:
        data = await self._client.get(
            f"/bibles/{self._bible_id}/books", {"include-chapters": "true"}
        )
        books: list[Book] = []

        for book in data or []:
            chapters = [
                Chapter(
                    number=chapter["number"],
                    verse_count=chapter_verse_count(book["id"], chapter["number"]),
                )
                for chapter in book.get("chapters") or []
                if chapter["number"] != "intro"
            ]
            books.append(
                Book(
                    id=book["id"],
                    name=short_name(book["id"], book.get("nameLong") or book["name"]),
                    chapters=chapters,
                )
            )

        return books

    async def list_verse_numbers(self, book_id: str, chapter: str) -> list[str]:
        data = await self._client.get(
            f"/bibles/{self._bible_id}/chapters/{book_id}.{chapter}/verses"
        )
        numbers = (verse["id"].rsplit(".", 1)[-1] for verse in data or [])
        return [number for number in numbers if number.isdigit()]

    async def get_passage(
        self, book_id: str, start_chapter: int, start_verse: int, end_chapter: int, end_verse: int
    ) -> Passage:
        chapters = list(range(start_chapter, end_chapter + 1))

        async def fetch(index: int, number: int) -> dict[str, Any]:
            return await self._client.get_cached(
                f"/bibles/{self._bible_id}/chapters/{book_id}.{number}", CHAPTER_PARAMS
            )

        results = await fetch_chapters(chapters, fetch, limit=MAX_CONCURRENT_CHAPTERS)

        parsed = []
        for index, data in enumerate(results):
            first, last = partial_bounds(index, len(chapters), start_verse, end_verse)
            parsed.append(trim_verses(parse_content(data.get("content")), first=first, last=last))

        return Passage(
            reference=build_reference(book_id, start_chapter, start_verse, end_chapter, end_verse),
            copyright=results[0].get("copyright") or "",
            attribution=API_BIBLE_ATTRIBUTION,
            paragraphs=with_chapter_markers(chapters, parsed),
        )

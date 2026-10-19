"""api.bible — the richest source, carrying headings, poetry and red letter.

Ranges are fetched one chapter at a time: api.bible's /passages endpoint
silently truncates long requests (ask for John 1:1-21:25 and it returns John
1:1-5:34 with no error), so each chapter is fetched whole and the ends of the
range are trimmed locally.
"""

from ...canon import short_name
from ...schemas import Book, Chapter
from ..base import ChapterText, chapter_verse_count
from .client import ApiBibleClient
from .parser import parse_content

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


class ApiBibleSource:
    max_concurrency = MAX_CONCURRENT_CHAPTERS
    attribution = API_BIBLE_ATTRIBUTION
    canonical_structure = False

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

    async def fetch_chapter(self, book_id: str, chapter: int) -> ChapterText:
        data = await self._client.get(
            f"/bibles/{self._bible_id}/chapters/{book_id}.{chapter}", CHAPTER_PARAMS
        )
        return ChapterText(
            paragraphs=parse_content((data or {}).get("content")),
            copyright=(data or {}).get("copyright") or "",
        )

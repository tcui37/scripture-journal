"""Verse ranges, built the same way whatever the upstream.

A source only fetches whole chapters (see `ChapterSource`). Everything a range
needs on top of that lives here, once: fetching each chapter at the source's
pace, keeping what its terms allow, trimming the two ends, and marking chapter
boundaries. Whole chapters are what get cached, so John 3:16 and John 3:1-21
share one upstream request.
"""

from .cache import Store
from .providers.base import (
    ChapterSource,
    ChapterText,
    build_reference,
    canonical_verse_numbers,
    fetch_chapters,
    partial_bounds,
    trim_verses,
    verse_numbers,
    with_chapter_markers,
)
from .schemas import Book, Passage


class Passages:
    """A `PassageProvider` for one translation, backed by a `ChapterSource`."""

    def __init__(
        self,
        source: ChapterSource,
        store: Store,
        *,
        namespace: str,
        ttl: float | None,
    ) -> None:
        """`namespace` keys the cache (source and upstream id); `ttl` is how
        long the source's terms allow its data to be kept, None for never."""
        self._source = source
        self._store = store
        self._namespace = namespace
        self._ttl = ttl

    async def list_books(self) -> list[Book]:
        async def load() -> list[dict]:
            return [book.model_dump() for book in await self._source.list_books()]

        data = await self._store.get_or_load(f"{self._namespace}:books", self._ttl, load)
        return [Book.model_validate(book) for book in data]

    async def list_verse_numbers(self, book_id: str, chapter: str) -> list[str]:
        if self._source.canonical_structure or not chapter.isdigit():
            return canonical_verse_numbers(book_id, chapter)
        # Read off the chapter itself: it is cached, and it is usually the
        # very next thing asked for, so this costs no extra request.
        return verse_numbers((await self.chapter(book_id, int(chapter))).paragraphs)

    async def chapter(self, book_id: str, number: int) -> ChapterText:
        async def load() -> dict:
            return (await self._source.fetch_chapter(book_id, number)).model_dump()

        key = f"{self._namespace}:{book_id}.{number}"
        # Validated afresh on every read, so trimming one passage can never
        # edit the cached copy another request will use.
        return ChapterText.model_validate(await self._store.get_or_load(key, self._ttl, load))

    async def get_passage(
        self, book_id: str, start_chapter: int, start_verse: int, end_chapter: int, end_verse: int
    ) -> Passage:
        chapters = list(range(start_chapter, end_chapter + 1))

        async def fetch(index: int, number: int) -> ChapterText:
            return await self.chapter(book_id, number)

        results = await fetch_chapters(chapters, fetch, limit=self._source.max_concurrency)

        trimmed = []
        for index, text in enumerate(results):
            first, last = partial_bounds(index, len(chapters), start_verse, end_verse)
            trimmed.append(trim_verses(text.paragraphs, first=first, last=last))

        return Passage(
            reference=build_reference(book_id, start_chapter, start_verse, end_chapter, end_verse),
            copyright=results[0].copyright if results else "",
            attribution=self._source.attribution,
            paragraphs=with_chapter_markers(chapters, trimmed),
        )

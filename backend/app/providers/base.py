"""What every translation source must be able to do.

Alongside the protocol, this holds the parts of fetching a passage that do not
depend on which upstream is answering: pacing one request per chapter, marking
chapter boundaries, and naming the range.
"""

import asyncio
from collections.abc import Awaitable, Callable, Iterable, Sequence
from typing import Protocol, TypeVar

from ..canon import BOOK_NAMES, BOOK_ORDER, is_new_testament
from ..schemas import Book, Chapter, Paragraph, Passage
from ..versification import VERSE_COUNTS

T = TypeVar("T")


class PassageProvider(Protocol):
    async def list_books(self) -> list[Book]: ...

    async def list_verse_numbers(self, book_id: str, chapter: str) -> list[str]: ...

    async def get_passage(
        self,
        book_id: str,
        start_chapter: int,
        start_verse: int,
        end_chapter: int,
        end_verse: int,
    ) -> Passage: ...


def canonical_books(*, new_testament_only: bool = False) -> list[Book]:
    """Book list built from the static canon, for text-only upstreams."""
    return [
        Book(
            id=book_id,
            name=BOOK_NAMES[book_id],
            chapters=[
                Chapter(number=str(index + 1), verse_count=count)
                for index, count in enumerate(VERSE_COUNTS[book_id])
            ],
        )
        for book_id in BOOK_ORDER
        if book_id in VERSE_COUNTS
        and (not new_testament_only or is_new_testament(book_id))
    ]


def chapter_verse_count(book_id: str, chapter_number: str) -> int:
    """Verses in one chapter per the static canon, or 0 when not known.

    Only the 66 canonical books are covered, so upstreams carrying the
    deuterocanon or an unusual versification fall back to zero. Callers treat
    that as "unknown" — it is used to size a selection, never to bound one.
    """
    counts = VERSE_COUNTS.get(book_id)
    if not counts or not chapter_number.isdigit():
        return 0
    index = int(chapter_number) - 1
    return counts[index] if 0 <= index < len(counts) else 0


def canonical_verse_numbers(book_id: str, chapter: str) -> list[str]:
    return [str(number) for number in range(1, chapter_verse_count(book_id, chapter) + 1)]


def chapter_marker(number: int) -> Paragraph:
    return Paragraph(kind="chapter", style="c", heading=str(number))


async def fetch_chapters(
    chapters: Sequence[int],
    fetch: Callable[[int, int], Awaitable[T]],
    *,
    limit: int,
) -> list[T]:
    """Fetch every chapter of a range, at most `limit` in flight at once.

    Every upstream here is fetched one chapter at a time — api.bible silently
    truncates long ranges, and the others have no range endpoint at all — so
    each provider needs the same bounded fan-out. `fetch` is given the index
    within the range as well as the chapter number, because the index is what
    says whether this chapter is an end of the range and therefore partial.
    """
    semaphore = asyncio.Semaphore(limit)

    async def one(index: int, number: int) -> T:
        async with semaphore:
            return await fetch(index, number)

    return list(await asyncio.gather(*(one(i, n) for i, n in enumerate(chapters))))


def partial_bounds(
    index: int, count: int, start_verse: int, end_verse: int
) -> tuple[int | None, int | None]:
    """The (first, last) verse wanted from one chapter of a range.

    Only the ends of a range are partial; None means "the whole way to this
    chapter's edge".
    """
    return (
        start_verse if index == 0 else None,
        end_verse if index == count - 1 else None,
    )


def with_chapter_markers(
    chapters: Sequence[int], per_chapter: Iterable[list[Paragraph]]
) -> list[Paragraph]:
    """Flatten per-chapter paragraphs, marking boundaries in a multi-chapter range.

    A single-chapter passage gets no marker: its number is already in the
    reference printed at the foot of the page.
    """
    multi = len(chapters) > 1
    out: list[Paragraph] = []
    for number, paragraphs in zip(chapters, per_chapter, strict=True):
        if multi:
            out.append(chapter_marker(number))
        out.extend(paragraphs)
    return out


def build_reference(book_id: str, sc: int, sv: int, ec: int, ev: int) -> str:
    name = BOOK_NAMES.get(book_id, book_id)
    if sc == ec:
        return f"{name} {sc}:{sv}" + (f"–{ev}" if ev != sv else "")
    return f"{name} {sc}:{sv}–{ec}:{ev}"

"""What every translation source must be able to do.

A source only knows how to list its books and fetch one whole chapter;
`app.passages` turns that into verse ranges, caching chapters along the way.
Alongside the protocols, this holds the parts of building a passage that do
not depend on which upstream is answering: pacing one request per chapter,
trimming the ends of a range, marking chapter boundaries, naming the range.
"""

import asyncio
from collections.abc import Awaitable, Callable, Iterable, Sequence
from typing import ClassVar, Protocol, TypeVar

from pydantic import BaseModel

from ..canon import BOOK_NAMES, BOOK_ORDER, is_new_testament
from ..schemas import Book, Chapter, Paragraph, Passage, Verse
from ..versification import VERSE_COUNTS

T = TypeVar("T")


class ChapterText(BaseModel):
    """One whole chapter, parsed — the unit every source fetches and caches."""

    paragraphs: list[Paragraph]
    #: The publisher's notice as the upstream reports it, if it does.
    copyright: str = ""


class ChapterSource(Protocol):
    #: Chapters fetched at once for a range; each upstream sets its own pace.
    max_concurrency: ClassVar[int]
    #: Attribution the licence requires on every page, or "".
    attribution: ClassVar[str]
    #: True when book and verse structure comes from the static canon, so
    #: listing verses costs no request; otherwise it is read off the chapter.
    canonical_structure: ClassVar[bool]

    async def list_books(self) -> list[Book]: ...

    async def fetch_chapter(self, book_id: str, chapter: int) -> ChapterText: ...


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


def trim_verses(
    paragraphs: list[Paragraph],
    *,
    first: int | None = None,
    last: int | None = None,
) -> list[Paragraph]:
    """Drop verses outside [first, last]; used on the end chapters of a range.

    Unnumbered runs (common in CSB poetry: each `qc`/`q*` line is its own
    paragraph with no verse tag) continue the most recent numbered verse, so
    retention must carry across paragraph boundaries — not only within one
    paragraph after a numbered sibling.
    """
    if first is None and last is None:
        return paragraphs

    kept_paragraphs: list[Paragraph] = []
    # True while the last numbered verse we saw was inside the keep window.
    keep_continuations = False

    for para in paragraphs:
        if para.kind != "text":
            kept_paragraphs.append(para)
            continue

        kept: list[Verse] = []
        for verse in para.verses:
            number = int(verse.number) if verse.number and verse.number.isdigit() else None
            if number is None:
                if keep_continuations:
                    kept.append(verse)
                continue
            in_range = (first is None or number >= first) and (
                last is None or number <= last
            )
            keep_continuations = in_range
            if in_range:
                kept.append(verse)

        if kept:
            para.verses = kept
            kept_paragraphs.append(para)

    return drop_orphan_headings(kept_paragraphs)


def drop_orphan_headings(paragraphs: list[Paragraph]) -> list[Paragraph]:
    """Remove headings left with no scripture under them after trimming."""
    out: list[Paragraph] = []

    for index, para in enumerate(paragraphs):
        if para.kind == "heading":
            has_text = False
            for later in paragraphs[index + 1 :]:
                if later.kind == "heading":
                    break
                if later.kind == "text" and later.verses:
                    has_text = True
                    break
            if not has_text:
                continue
        out.append(para)

    return out


def verse_numbers(paragraphs: list[Paragraph]) -> list[str]:
    """The numbered verses of a chapter, in order, each once."""
    seen: dict[str, None] = {}
    for para in paragraphs:
        for verse in para.verses:
            if verse.number and verse.number.isdigit():
                seen.setdefault(verse.number, None)
    return list(seen)

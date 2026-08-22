"""Free Use Bible API — over a thousand translations across many languages.

Its chapter JSON is already close to our model: a flat list of `heading`,
`verse` and `line_break` items, where a verse's content is a mix of plain
strings and `{"text": …, "poem": 1}` fragments for poetry.
"""

from typing import Any

from ...canon import has_cjk, short_name
from ...schemas import Book, Chapter, Paragraph, Passage, Segment, Verse
from ..base import (
    build_reference,
    chapter_verse_count,
    fetch_chapters,
    partial_bounds,
    with_chapter_markers,
)
from .client import HelloAoClient

MAX_CONCURRENT_CHAPTERS = 8


class HelloAoProvider:
    def __init__(self, client: HelloAoClient, translation_id: str) -> None:
        self._client = client
        self._translation_id = translation_id

    async def list_books(self) -> list[Book]:
        data = await self._client.get(f"/{self._translation_id}/books.json")
        return [
            Book(
                id=book["id"],
                name=short_name(
                    book["id"], book.get("commonName") or book.get("name") or book["id"]
                ),
                chapters=_chapters(book),
            )
            for book in data.get("books") or []
        ]

    async def list_verse_numbers(self, book_id: str, chapter: str) -> list[str]:
        data = await self._client.get(f"/{self._translation_id}/{book_id}/{chapter}.json")
        return [
            str(item["number"])
            for item in (data.get("chapter") or {}).get("content") or []
            if item.get("type") == "verse" and item.get("number") is not None
        ]

    async def get_passage(
        self, book_id: str, start_chapter: int, start_verse: int, end_chapter: int, end_verse: int
    ) -> Passage:
        chapters = list(range(start_chapter, end_chapter + 1))

        async def fetch(index: int, number: int) -> dict[str, Any]:
            return await self._client.get(f"/{self._translation_id}/{book_id}/{number}.json")

        results = await fetch_chapters(chapters, fetch, limit=MAX_CONCURRENT_CHAPTERS)

        parsed = []
        for index, data in enumerate(results):
            first, last = partial_bounds(index, len(chapters), start_verse, end_verse)
            content = (data.get("chapter") or {}).get("content") or []
            parsed.append(_parse_chapter(content, first=first, last=last))

        translation = (results[0].get("translation") or {}) if results else {}

        return Passage(
            reference=build_reference(book_id, start_chapter, start_verse, end_chapter, end_verse),
            copyright=translation.get("licenseUrl") or translation.get("name") or "",
            paragraphs=with_chapter_markers(chapters, parsed),
        )


def _chapters(book: dict[str, Any]) -> list[Chapter]:
    """Chapter list for one book, sized from the canon where it is known.

    The catalogue gives chapter bounds but no verse counts, and any of those
    keys may be present-and-null, so each is coerced rather than defaulted.
    """
    first = _as_int(book.get("firstChapterNumber"), 1)
    last = _as_int(book.get("lastChapterNumber"), 0) or _as_int(
        book.get("numberOfChapters"), 1
    )

    return [
        Chapter(
            number=str(number),
            verse_count=chapter_verse_count(book.get("id") or "", str(number)),
        )
        for number in range(first, last + 1)
    ]


def _as_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _parse_chapter(
    content: list[dict[str, Any]], *, first: int | None, last: int | None
) -> list[Paragraph]:
    """Flatten a chapter's items, keeping only verses inside [first, last]."""
    paragraphs: list[Paragraph] = []
    prose: Paragraph | None = None

    def flush() -> None:
        nonlocal prose
        if prose is not None and prose.verses:
            paragraphs.append(prose)
        prose = None

    for item in content:
        kind = item.get("type")

        if kind == "heading":
            flush()
            text = " ".join(str(part) for part in item.get("content") or []).strip()
            if text:
                paragraphs.append(Paragraph(kind="heading", style="s", heading=text))
            continue

        if kind == "line_break":
            flush()
            continue

        if kind != "verse":
            continue

        number = item.get("number")
        if number is None:
            continue
        if first is not None and number < first:
            continue
        if last is not None and number > last:
            continue

        # A verse is prose unless its fragments carry poetry levels, in which
        # case each level becomes its own indented paragraph.
        pending_number: str | None = str(number)
        for level, text in _fragments(item.get("content") or []):
            if level == 0:
                if prose is None:
                    prose = Paragraph(kind="text", style="p")
                target = prose
            else:
                flush()
                target = Paragraph(kind="text", style=f"q{min(level, 2)}")
                paragraphs.append(target)

            if pending_number is not None:
                target.verses.append(Verse(number=pending_number))
                pending_number = None
            elif not target.verses:
                target.verses.append(Verse())

            segments = target.verses[-1].segments
            if segments and _needs_space(segments[-1].text, text):
                text = " " + text
            segments.append(Segment(text=text))

    flush()
    return [p for p in paragraphs if p.kind != "text" or p.verses]


def _fragments(content: list[Any]) -> list[tuple[int, str]]:
    """(poetry level, text) pairs; level 0 is prose. Footnotes are dropped."""
    out: list[tuple[int, str]] = []
    for part in content:
        if isinstance(part, str):
            if part.strip():
                out.append((0, part))
        elif isinstance(part, dict) and "text" in part:
            out.append((int(part.get("poem") or 0), str(part["text"])))
    return out


# Punctuation that binds to the word before it, so no space belongs in front.
_BINDS_LEFT = ",.;:!?)]}’”'\"…"


def _needs_space(before: str, after: str) -> bool:
    """Whether a space belongs between two fragments of the same verse.

    Upstream splits a verse around each footnote marker without keeping the
    space the marker stood in for: John 3:16 arrives as "…one and only",
    {note}, "Son, that…". Dropping the note would weld the words together, so
    the space is put back — unless a side already carries one, or the next
    fragment opens with punctuation that attaches to the preceding word.
    """
    if not before or not after:
        return False
    if before[-1].isspace() or after[0].isspace():
        return False
    # CJK does not put spaces between words; a dropped footnote must not
    # invent one ("神爱世人" + note + "甚至" → not "神爱世人 甚至").
    if has_cjk(before[-1]) or has_cjk(after[0]):
        return False
    return after[0] not in _BINDS_LEFT

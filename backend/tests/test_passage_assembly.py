"""Passage assembly: fan-out, partial ends, and chapter markers.

`Passages.get_passage` is the same for every source — fetch each chapter of
the range concurrently, trim only the two ends, and mark boundaries when there
is more than one chapter. These exercise that shared machinery against a stub
client, so no upstream is called and no quota is spent.
"""

import asyncio

import pytest

from app.canon import short_name
from app.providers.base import (
    build_reference,
    canonical_books,
    fetch_chapters,
    partial_bounds,
    with_chapter_markers,
)
from app.cache import Store
from app.passages import Passages
from app.providers.bible_api.provider import BibleApiSource
from app.providers.esv.provider import EsvSource
from app.providers.helloao.provider import HelloAoSource
from app.schemas import Paragraph


def passages(source, ttl: float | None = None) -> Passages:
    return Passages(source, Store(), namespace="test", ttl=ttl)

# ── the shared helpers ────────────────────────────────────────────────────


def test_partial_bounds_marks_only_the_ends():
    # A three-chapter range: first is bounded below, last above, middle neither.
    assert partial_bounds(0, 3, 5, 9) == (5, None)
    assert partial_bounds(1, 3, 5, 9) == (None, None)
    assert partial_bounds(2, 3, 5, 9) == (None, 9)


def test_partial_bounds_single_chapter_is_bounded_both_ends():
    assert partial_bounds(0, 1, 5, 9) == (5, 9)


def test_chapter_markers_omitted_for_a_single_chapter():
    body = [Paragraph(kind="text", style="p")]
    assert with_chapter_markers([3], [body]) == body


def test_chapter_markers_precede_each_chapter_of_a_range():
    per_chapter = [
        [Paragraph(kind="text", style="p", heading="one")],
        [Paragraph(kind="text", style="p", heading="two")],
    ]
    out = with_chapter_markers([4, 5], per_chapter)
    assert [(p.kind, p.heading) for p in out] == [
        ("chapter", "4"),
        ("text", "one"),
        ("chapter", "5"),
        ("text", "two"),
    ]


@pytest.mark.asyncio
async def test_fetch_chapters_preserves_order_despite_concurrency():
    """Results must line up with the chapter list, not with completion order."""

    async def fetch(index: int, number: int) -> int:
        # Earlier chapters sleep longer, so completion order is reversed.
        await asyncio.sleep(0.02 * (5 - index))
        return number

    assert await fetch_chapters([1, 2, 3, 4, 5], fetch, limit=5) == [1, 2, 3, 4, 5]


@pytest.mark.asyncio
async def test_fetch_chapters_respects_the_concurrency_limit():
    live = 0
    peak = 0

    async def fetch(index: int, number: int) -> int:
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        await asyncio.sleep(0.01)
        live -= 1
        return number

    await fetch_chapters(list(range(12)), fetch, limit=3)
    assert peak <= 3, f"ran {peak} at once with a limit of 3"


def test_build_reference_single_verse_omits_the_dash():
    assert build_reference("JHN", 3, 16, 3, 16) == "John 3:16"


def test_build_reference_same_chapter_and_spanning_ranges():
    assert build_reference("JHN", 3, 16, 3, 17) == "John 3:16–17"
    assert build_reference("JHN", 1, 1, 2, 5) == "John 1:1–2:5"


def test_build_reference_unknown_book_uses_the_id():
    assert build_reference("TOB", 1, 1, 1, 2) == "TOB 1:1–2"


def test_short_name_prefers_the_english_canon():
    assert short_name("MAT", "The Gospel According to Matthew") == "Matthew"
    assert short_name("GEN", "1. Mose") == "Genesis"
    assert short_name("TOB", "Tobit") == "Tobit"


def test_short_name_keeps_cjk_titles():
    assert short_name("JHN", "約翰福音") == "約翰福音"
    assert short_name("MAT", "마태복음") == "마태복음"
    assert short_name("GEN", "創世記") == "創世記"


def test_canonical_books_can_drop_the_old_testament():
    """YLT (and any NT-only edition) must not be offered Genesis through Malachi."""
    whole = canonical_books()
    nt = canonical_books(new_testament_only=True)
    assert whole[0].id == "GEN" and whole[-1].id == "REV"
    assert nt[0].id == "MAT" and nt[-1].id == "REV"
    assert {book.id for book in nt}.isdisjoint({"GEN", "PSA", "MAL"})


@pytest.mark.asyncio
async def test_helloao_keeps_cjk_book_names():
    class BooksHelloAo:
        async def get(self, path: str):
            return {
                "books": [
                    {
                        "id": "JHN",
                        "commonName": "約翰福音",
                        "firstChapterNumber": 1,
                        "lastChapterNumber": 21,
                    },
                    {
                        "id": "MAT",
                        "commonName": "The Gospel According to Matthew",
                        "firstChapterNumber": 1,
                        "lastChapterNumber": 28,
                    },
                ]
            }

    books = await passages(HelloAoSource(BooksHelloAo(), "cmn_cuv")).list_books()  # type: ignore[arg-type]
    by_id = {book.id: book.name for book in books}
    assert by_id["JHN"] == "約翰福音"
    assert by_id["MAT"] == "Matthew"


# ── end to end through a provider, with a stub client ─────────────────────


class StubHelloAo:
    """Serves three canned chapters of five verses each."""

    def __init__(self) -> None:
        self.paths: list[str] = []

    async def get(self, path: str):
        self.paths.append(path)
        chapter = int(path.rsplit("/", 1)[-1].removesuffix(".json"))
        return {
            "translation": {"name": "Stub", "licenseUrl": "https://example.test/licence"},
            "chapter": {
                "content": [
                    {
                        "type": "verse",
                        "number": verse,
                        "content": [f"c{chapter}v{verse}."],
                    }
                    for verse in range(1, 6)
                ]
            },
        }


@pytest.mark.asyncio
async def test_multi_chapter_range_trims_only_its_ends():
    client = StubHelloAo()
    provider = passages(HelloAoSource(client, "STUB"))  # type: ignore[arg-type]

    # Chapters 1-3, from 1:3 to 3:2 — so 1:3-5, all of 2, then 3:1-2.
    passage = await provider.get_passage("JHN", 1, 3, 3, 2)

    body = " ".join(
        "".join(s.text for s in verse.segments)
        for para in passage.paragraphs
        for verse in para.verses
    )
    assert body == "c1v3. c1v4. c1v5. c2v1. c2v2. c2v3. c2v4. c2v5. c3v1. c3v2."

    # One request per chapter, and a marker before each.
    assert len(client.paths) == 3
    assert [p.heading for p in passage.paragraphs if p.kind == "chapter"] == ["1", "2", "3"]
    assert passage.reference == "John 1:3–3:2"
    assert passage.copyright == "https://example.test/licence"


@pytest.mark.asyncio
async def test_single_chapter_range_has_no_marker():
    provider = passages(HelloAoSource(StubHelloAo(), "STUB"))  # type: ignore[arg-type]
    passage = await provider.get_passage("JHN", 2, 2, 2, 4)

    assert not [p for p in passage.paragraphs if p.kind == "chapter"]
    body = " ".join(
        "".join(s.text for s in verse.segments)
        for para in passage.paragraphs
        for verse in para.verses
    )
    assert body == "c2v2. c2v3. c2v4."
    assert passage.reference == "John 2:2–4"


# ── bible-api.com reference format ────────────────────────────────────────


class StubBibleApi:
    """Records the reference strings asked for, and answers with one verse."""

    def __init__(self) -> None:
        self.references: list[str] = []

    async def passage(self, reference: str, translation: str):
        self.references.append(reference)
        return {"translation_name": "Stub", "verses": [{"verse": 1, "text": "text."}]}


@pytest.mark.asyncio
async def test_bible_api_closes_open_ranges_on_the_real_last_verse():
    """Regression: a ":999" sentinel 404s, breaking every multi-chapter range.

    bible-api.com rejects an end verse the chapter does not have, so an
    unbounded chapter has to be closed on its canonical last verse — John 1
    ends at 51, John 2 at 25.
    """
    client = StubBibleApi()
    provider = passages(BibleApiSource(client, "bbe"))  # type: ignore[arg-type]

    await provider.get_passage("JHN", 1, 1, 3, 4)

    assert client.references == ["John 1:1-51", "John 2:1-25", "John 3:1-36"]
    assert not any("999" in reference for reference in client.references)


@pytest.mark.asyncio
async def test_bible_api_fetches_whole_chapters_for_partial_ranges():
    """Whole chapters are the cached unit; the range is trimmed locally."""
    client = StubBibleApi()
    provider = passages(BibleApiSource(client, "bbe"))  # type: ignore[arg-type]

    await provider.get_passage("JHN", 3, 16, 3, 17)

    assert client.references == ["John 3:1-36"]


@pytest.mark.asyncio
async def test_bible_api_asks_for_a_whole_chapter_outside_the_canon():
    """With no verse count to close on, the whole chapter is requested."""
    client = StubBibleApi()
    provider = passages(BibleApiSource(client, "bbe"))  # type: ignore[arg-type]

    await provider.get_passage("TOB", 1, 1, 2, 3)

    assert client.references[0] == "TOB 1"


# ── ESV query format ──────────────────────────────────────────────────────


class StubEsv:
    """Records Crossway query strings; returns empty HTML so the parser is idle."""

    def __init__(self) -> None:
        self.queries: list[str] = []

    async def passage_html(self, query: str) -> str:
        self.queries.append(query)
        return ""


@pytest.mark.asyncio
async def test_esv_open_chapters_use_the_999_sentinel():
    """Crossway wants an explicit end; 999 means 'to the end of the chapter'.

    The opposite of bible-api.com, which 404s on a verse the chapter does not
    have. Copying that close-on-canon behaviour here would be a silent miss.
    """
    client = StubEsv()
    provider = passages(EsvSource(client))  # type: ignore[arg-type]

    await provider.get_passage("JHN", 1, 1, 3, 4)

    assert client.queries == ["John 1:1-1:999", "John 2:1-2:999", "John 3:1-3:999"]


# ── caching across ranges ─────────────────────────────────────────────────


def body(passage) -> str:
    return " ".join(
        "".join(s.text for s in verse.segments)
        for para in passage.paragraphs
        for verse in para.verses
    )


@pytest.mark.asyncio
async def test_cached_chapter_serves_every_range_inside_it():
    client = StubHelloAo()
    provider = passages(HelloAoSource(client, "STUB"), ttl=60)  # type: ignore[arg-type]

    assert body(await provider.get_passage("JHN", 2, 2, 2, 3)) == "c2v2. c2v3."
    # Trimming the first passage must not have edited the cached chapter.
    assert body(await provider.get_passage("JHN", 2, 1, 2, 5)) == (
        "c2v1. c2v2. c2v3. c2v4. c2v5."
    )
    assert await provider.list_verse_numbers("JHN", "2") == ["1", "2", "3", "4", "5"]
    assert client.paths == ["/STUB/JHN/2.json"]


@pytest.mark.asyncio
async def test_uncached_source_refetches_every_time():
    """The ESV has no TTL: nothing is kept between requests."""
    client = StubEsv()
    provider = passages(EsvSource(client), ttl=None)  # type: ignore[arg-type]

    await provider.get_passage("JHN", 3, 16, 3, 17)
    await provider.get_passage("JHN", 3, 16, 3, 17)

    assert client.queries == ["John 3:1-3:999", "John 3:1-3:999"]


@pytest.mark.asyncio
async def test_canonical_sources_list_verses_without_a_request():
    client = StubEsv()
    provider = passages(EsvSource(client))  # type: ignore[arg-type]

    assert len(await provider.list_verse_numbers("JHN", "3")) == 36
    assert client.queries == []


@pytest.mark.asyncio
async def test_concurrent_readers_share_one_request():
    client = StubHelloAo()
    store = Store()
    first = Passages(HelloAoSource(client, "STUB"), store, namespace="n", ttl=60)  # type: ignore[arg-type]
    second = Passages(HelloAoSource(client, "STUB"), store, namespace="n", ttl=60)  # type: ignore[arg-type]

    await asyncio.gather(
        first.get_passage("JHN", 1, 1, 1, 5), second.get_passage("JHN", 1, 2, 1, 3)
    )

    assert client.paths == ["/STUB/JHN/1.json"]

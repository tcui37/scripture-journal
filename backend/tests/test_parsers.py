"""Parser tests.

Every provider's parser is a pure function over an upstream payload, so these
run without network access or credentials — which also keeps them off
api.bible's metered quota. The fixtures are trimmed copies of real responses.
"""

from app.providers.api_bible.parser import (
    drop_orphan_headings,
    parse_content,
    trim_verses,
)
from app.providers.esv.parser import parse_esv_html
from app.providers.helloao.provider import _chapters, _needs_space, _parse_chapter


def text_of(paragraphs):
    """All scripture text in order, verses joined the way the renderer joins them."""
    return " ".join(
        "".join(segment.text for segment in verse.segments)
        for para in paragraphs
        for verse in para.verses
    )


# ── helloao ───────────────────────────────────────────────────────────────


def test_footnote_between_fragments_keeps_the_space():
    """Regression: dropping a footnote used to weld two words together.

    Upstream splits a verse around each note and keeps no whitespace, so
    "…one and only" + {note} + "Son, that…" rendered as "onlySon".
    """
    content = [
        {
            "type": "verse",
            "number": 16,
            "content": [
                "For God so loved the world that He gave His one and only",
                {"noteId": 17},
                "Son, that everyone who believes in Him shall not perish.",
            ],
        }
    ]
    assert text_of(_parse_chapter(content, first=None, last=None)) == (
        "For God so loved the world that He gave His one and only Son, "
        "that everyone who believes in Him shall not perish."
    )


def test_footnote_before_punctuation_gains_no_space():
    content = [
        {
            "type": "verse",
            "number": 3,
            "content": ['and God said, "Let there be light"', {"noteId": 1}, ", and there was light."],
        }
    ]
    assert '"Let there be light", and there was light.' in text_of(
        _parse_chapter(content, first=None, last=None)
    )


def test_needs_space_rules():
    assert _needs_space("only", "Son") is True
    assert _needs_space("only ", "Son") is False  # already spaced
    assert _needs_space("only", " Son") is False
    assert _needs_space("word", ",and") is False  # binds left
    assert _needs_space("word", ".") is False
    assert _needs_space("light", "’’") is False  # closing quote
    assert _needs_space("", "x") is False
    assert _needs_space("x", "") is False


def test_helloao_trims_to_the_requested_range():
    content = [
        {"type": "verse", "number": n, "content": [f"verse {n}."]} for n in range(1, 6)
    ]
    kept = text_of(_parse_chapter(content, first=2, last=4))
    assert kept == "verse 2. verse 3. verse 4."


def test_helloao_heading_precedes_its_verses():
    content = [
        {"type": "heading", "content": ["The Word Became Flesh"]},
        {"type": "verse", "number": 1, "content": ["In the beginning."]},
    ]
    paragraphs = _parse_chapter(content, first=None, last=None)
    assert [(p.kind, p.heading) for p in paragraphs] == [
        ("heading", "The Word Became Flesh"),
        ("text", ""),
    ]


def test_helloao_poetry_becomes_indented_paragraphs():
    content = [
        {
            "type": "verse",
            "number": 1,
            "content": [
                {"text": "The LORD is my shepherd;", "poem": 1},
                {"text": "I shall not want.", "poem": 2},
            ],
        }
    ]
    paragraphs = _parse_chapter(content, first=None, last=None)
    assert [p.style for p in paragraphs] == ["q1", "q2"]


def test_chapters_survives_null_bounds():
    """A present-but-null bound used to raise TypeError from range()."""
    book = {
        "id": "JHN",
        "firstChapterNumber": 1,
        "lastChapterNumber": None,
        "numberOfChapters": 21,
    }
    chapters = _chapters(book)
    assert len(chapters) == 21
    # Verse counts come from the canon, which helloao does not report.
    assert chapters[0].verse_count == 51


def test_chapters_unknown_book_has_zero_counts():
    chapters = _chapters({"id": "TOB", "firstChapterNumber": 1, "lastChapterNumber": 2})
    assert [c.verse_count for c in chapters] == [0, 0]


# ── api.bible ─────────────────────────────────────────────────────────────

API_BIBLE_CONTENT = [
    {
        "type": "tag",
        "name": "para",
        "attrs": {"style": "s1"},
        "items": [{"type": "text", "text": "The Word Became Flesh"}],
    },
    {
        "type": "tag",
        "name": "para",
        "attrs": {"style": "p"},
        "items": [
            {"type": "tag", "name": "verse", "attrs": {"number": "1"}},
            {"type": "text", "text": "In the beginning was the Word, "},
            {
                "type": "tag",
                "name": "char",
                "attrs": {"style": "wj"},
                "items": [{"type": "text", "text": "and the Word was with God."}],
            },
            {"type": "tag", "name": "note", "items": [{"type": "text", "text": "dropped"}]},
            {"type": "tag", "name": "verse", "attrs": {"number": "2"}},
            {"type": "text", "text": "He was with God in the beginning."},
        ],
    },
]


def test_api_bible_parses_headings_verses_and_red_letter():
    paragraphs = parse_content(API_BIBLE_CONTENT)
    assert [p.kind for p in paragraphs] == ["heading", "text"]
    assert paragraphs[0].heading == "The Word Became Flesh"

    verses = paragraphs[1].verses
    assert [v.number for v in verses] == ["1", "2"]
    assert any(segment.wj for segment in verses[0].segments)
    # Footnotes are dropped, not rendered.
    assert "dropped" not in text_of(paragraphs)


def test_api_bible_trim_keeps_only_the_requested_verses():
    paragraphs = trim_verses(parse_content(API_BIBLE_CONTENT), first=2, last=2)
    numbers = [v.number for p in paragraphs for v in p.verses]
    assert numbers == ["2"]


def test_orphan_heading_is_dropped_after_trimming():
    """A heading whose verses were all trimmed away must not be left behind."""
    paragraphs = trim_verses(parse_content(API_BIBLE_CONTENT), first=9, last=9)
    assert paragraphs == []


def test_drop_orphan_headings_keeps_headings_that_still_have_text():
    paragraphs = parse_content(API_BIBLE_CONTENT)
    assert drop_orphan_headings(paragraphs) == paragraphs


# ── ESV ───────────────────────────────────────────────────────────────────

ESV_HTML = """
<h3>The Beatitudes</h3>
<p class="block-indent">
  <span class="line"><b class="verse-num woc">3 </b><span class="woc">Blessed are the poor in spirit,</span></span>
  <br><span class="indent line"><span class="woc">for theirs is the kingdom of heaven.</span></span>
</p>
"""


def test_esv_html_parses_heading_poetry_and_words_of_christ():
    paragraphs = parse_esv_html(ESV_HTML)
    kinds = [p.kind for p in paragraphs]
    assert kinds[0] == "heading"
    assert paragraphs[0].heading == "The Beatitudes"

    # Each poetry line becomes its own paragraph so it can be indented.
    styles = [p.style for p in paragraphs[1:]]
    assert styles == ["q1", "q2"]

    segments = [s for p in paragraphs for v in p.verses for s in v.segments]
    assert segments and all(s.wj for s in segments)

    # The verse number attaches to the line it introduces.
    numbers = [v.number for p in paragraphs for v in p.verses if v.number]
    assert numbers == ["3"]


def test_esv_html_ignores_empty_markup():
    assert parse_esv_html("") == []
    assert parse_esv_html("<p></p><h3>  </h3>") == []

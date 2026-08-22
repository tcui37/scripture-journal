from typing import Literal

from pydantic import BaseModel


class BibleLimits(BaseModel):
    """How much of a translation may be shown at once, per its licence."""

    max_verses: int | None = None
    max_book_fraction: float | None = None
    exempt_single_chapter_books: bool = False
    note: str = ""


class BibleSummary(BaseModel):
    id: str
    label: str
    language: str = "eng"
    language_name: str = "English"
    limits: BibleLimits | None = None


class LanguageSummary(BaseModel):
    code: str
    name: str
    count: int = 0


class Chapter(BaseModel):
    number: str
    #: Verses in this chapter, used to size a selection before requesting it.
    verse_count: int = 0


class Book(BaseModel):
    id: str
    name: str
    chapters: list[Chapter]


class Segment(BaseModel):
    """A run of text sharing one set of character-level styles."""

    text: str
    wj: bool = False
    italic: bool = False


class Verse(BaseModel):
    number: str | None = None
    segments: list[Segment] = []


class Paragraph(BaseModel):
    # "chapter" marks the start of a new chapter in a multi-chapter passage.
    kind: Literal["heading", "text", "chapter"]
    style: str
    heading: str = ""
    verses: list[Verse] = []


class Passage(BaseModel):
    reference: str
    #: The publisher's copyright notice for this translation.
    copyright: str
    #: Provider attribution the licence requires us to display, if any. Kept
    #: separate from `copyright` so the frontend can print both without
    #: learning which upstream served the passage.
    attribution: str = ""
    paragraphs: list[Paragraph]

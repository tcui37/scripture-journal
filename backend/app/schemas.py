from typing import Literal

from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    """A model the API sends. Fields with defaults are still always present in
    the JSON, so the schema marks them required — and the TypeScript generated
    from it (frontend `npm run gen:types`) does not make them optional."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class BibleLimits(ResponseModel):
    """How much of a translation may be shown at once, per its licence."""

    max_verses: int | None = None
    max_book_fraction: float | None = None
    exempt_single_chapter_books: bool = False
    note: str = ""
    #: The resulting cap for each canonical book (USFM id), null where the
    #: book is exempt. The UI reads this rather than re-deriving the rules; a
    #: book missing from it is capped at `max_verses`.
    allowances: dict[str, int | None] = {}


class BibleSummary(ResponseModel):
    id: str
    label: str
    language: str = "eng"
    language_name: str = "English"
    limits: BibleLimits | None = None


class LanguageSummary(ResponseModel):
    code: str
    name: str
    count: int = 0


class Chapter(ResponseModel):
    number: str
    #: Verses in this chapter, used to size a selection before requesting it.
    verse_count: int = 0


class Book(ResponseModel):
    id: str
    name: str
    chapters: list[Chapter]


class Segment(ResponseModel):
    """A run of text sharing one set of character-level styles."""

    text: str
    wj: bool = False
    italic: bool = False


class Verse(ResponseModel):
    number: str | None = None
    segments: list[Segment] = []


class Paragraph(ResponseModel):
    # "chapter" marks the start of a new chapter in a multi-chapter passage.
    kind: Literal["heading", "text", "chapter"]
    style: str
    heading: str = ""
    verses: list[Verse] = []


class Passage(ResponseModel):
    reference: str
    #: The publisher's copyright notice for this translation.
    copyright: str
    #: Provider attribution the licence requires us to display, if any. Kept
    #: separate from `copyright` so the frontend can print both without
    #: learning which upstream served the passage.
    attribution: str = ""
    paragraphs: list[Paragraph]

from typing import Literal

from pydantic import BaseModel


class BibleSummary(BaseModel):
    id: str
    label: str


class Chapter(BaseModel):
    number: str


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
    copyright: str
    paragraphs: list[Paragraph]

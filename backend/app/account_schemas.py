"""Pydantic models for auth, designs, and journal files."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Name = Annotated[str, Field(min_length=1, max_length=80)]
BookId = Annotated[str, Field(pattern=r"^[A-Z0-9]{3}$")]
ChapterVerse = Annotated[str, Field(pattern=r"^\d{1,3}$")]

PageSize = Literal[
    "A3",
    "A4",
    "A5",
    "A6",
    "B5",
    "B6",
    "Letter",
    "Half letter",
    "Legal",
    "Tabloid",
    "Executive",
    "6 × 9 in",
]


class Credentials(BaseModel):
    email: Annotated[str, Field(min_length=1)]
    password: Annotated[str, Field(min_length=1)]


class AuthUserOut(BaseModel):
    id: str
    email: str


class AuthUserResponse(BaseModel):
    user: AuthUserOut


class SignupResponse(AuthUserResponse):
    needs_confirmation: bool


class SigninResponse(AuthUserResponse):
    needs_confirmation: bool = False


class ChangePassword(BaseModel):
    current_password: Annotated[str, Field(min_length=1)]
    new_password: Annotated[str, Field(min_length=6, max_length=72)]


class Design(BaseModel):
    """Page layout. Same JSON shape as the frontend Settings / Design object."""

    model_config = ConfigDict(extra="ignore")

    pageSize: PageSize
    orientation: Literal["portrait", "landscape"]
    layout: Literal["right", "bottom", "twocol", "verso", "wide"]
    parallelMode: Literal["columns", "flow", "stacked", "bands", "facing"]
    lines: Literal["ruled", "dots", "blank", "none"]
    font: Literal["serif", "sans"]
    size: float
    lead: float
    numbers: Literal["sup", "inline"]
    flow: Literal["para", "line"]
    poetryIndent: Literal["off", "regular", "deep"]
    wordsOfChrist: bool
    pageNumbers: bool
    paper: Literal["Ivory", "Bright white", "Warm grey"]
    justify: bool
    showHeadings: bool
    showChapterNumbers: bool
    parallelSwap: bool
    titleLine: bool
    textShare: float


def _strip_name(value: str) -> str:
    return value.strip()


def _isoformat(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


class DesignCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Name
    settings: Design

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: object) -> object:
        return _strip_name(value) if isinstance(value, str) else value


class DesignPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Name | None = None
    settings: Design | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: object) -> object:
        return _strip_name(value) if isinstance(value, str) else value


class DesignRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    settings: Design
    created_at: str
    updated_at: str

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _ts(cls, value: object) -> str:
        return _isoformat(value)


class JournalFileCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Name
    book_id: BookId
    start_chapter: ChapterVerse
    start_verse: ChapterVerse
    end_chapter: ChapterVerse
    end_verse: ChapterVerse
    design: Design

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: object) -> object:
        return _strip_name(value) if isinstance(value, str) else value


class JournalFilePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Name | None = None
    book_id: BookId | None = None
    start_chapter: ChapterVerse | None = None
    start_verse: ChapterVerse | None = None
    end_chapter: ChapterVerse | None = None
    end_verse: ChapterVerse | None = None
    design: Design | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: object) -> object:
        return _strip_name(value) if isinstance(value, str) else value


class JournalFile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    book_id: str
    start_chapter: str
    start_verse: str
    end_chapter: str
    end_verse: str
    design: Design
    created_at: str
    updated_at: str

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _ts(cls, value: object) -> str:
        return _isoformat(value)

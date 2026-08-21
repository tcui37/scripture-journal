from typing import Annotated

from fastapi import APIRouter, Path, Query

from ..bible import ENGLISH_BIBLES
from ..dependencies import BibleClientDep
from ..parser import parse_content
from ..schemas import BibleSummary, Book, Chapter, Passage

router = APIRouter(prefix="/api", tags=["bible"])

# api.bible identifiers are opaque; constrain them so nothing odd reaches the
# upstream URL path.
BibleId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{16}-\d{2}$")]
BookId = Annotated[str, Path(pattern=r"^[A-Z0-9]{3}$")]
ChapterNum = Annotated[str, Path(pattern=r"^\d{1,3}$")]
VerseNum = Annotated[str, Query(pattern=r"^\d{1,3}$")]


@router.get("/bibles")
async def list_bibles() -> list[BibleSummary]:
    return [BibleSummary(id=bible_id, label=label) for bible_id, label in ENGLISH_BIBLES]


@router.get("/bibles/{bible_id}/books")
async def list_books(bible_id: BibleId, client: BibleClientDep) -> list[Book]:
    data = await client.get(f"/bibles/{bible_id}/books", {"include-chapters": "true"})
    return [
        Book(
            id=book["id"],
            name=book.get("nameLong") or book["name"],
            chapters=[
                Chapter(number=chapter["number"])
                for chapter in book.get("chapters") or []
                if chapter["number"] != "intro"
            ],
        )
        for book in data or []
    ]


@router.get("/bibles/{bible_id}/books/{book_id}/chapters/{chapter}/verses")
async def list_verse_numbers(
    bible_id: BibleId,
    book_id: BookId,
    chapter: ChapterNum,
    client: BibleClientDep,
) -> list[str]:
    data = await client.get(f"/bibles/{bible_id}/chapters/{book_id}.{chapter}/verses")
    numbers = (verse["id"].rsplit(".", 1)[-1] for verse in data or [])
    return [number for number in numbers if number.isdigit()]


@router.get("/bibles/{bible_id}/books/{book_id}/chapters/{chapter}/passage")
async def get_passage(
    bible_id: BibleId,
    book_id: BookId,
    chapter: ChapterNum,
    client: BibleClientDep,
    start: VerseNum,
    end: VerseNum,
) -> Passage:
    passage_id = f"{book_id}.{chapter}.{start}-{book_id}.{chapter}.{end}"
    data = await client.get(
        f"/bibles/{bible_id}/passages/{passage_id}",
        {
            "content-type": "json",
            "include-verse-numbers": "true",
            "include-titles": "true",
            "include-chapter-numbers": "false",
            "include-notes": "false",
        },
    )
    return Passage(
        reference=data.get("reference", ""),
        copyright=data.get("copyright") or "",
        paragraphs=parse_content(data.get("content")),
    )

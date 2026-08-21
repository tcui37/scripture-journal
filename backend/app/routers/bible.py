import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, status

from ..bible import ENGLISH_BIBLES, MAX_CHAPTERS, MAX_CONCURRENT_CHAPTERS
from ..dependencies import BibleClientDep
from ..parser import parse_content, trim_verses
from ..schemas import BibleSummary, Book, Chapter, Paragraph, Passage

router = APIRouter(prefix="/api", tags=["bible"])

# api.bible identifiers are opaque; constrain them so nothing odd reaches the
# upstream URL path.
BibleId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{16}-\d{2}$")]
BookId = Annotated[str, Path(pattern=r"^[A-Z0-9]{3}$")]
ChapterNum = Annotated[str, Path(pattern=r"^\d{1,3}$")]
ChapterQuery = Annotated[str, Query(pattern=r"^\d{1,3}$")]
VerseQuery = Annotated[str, Query(pattern=r"^\d{1,3}$")]


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


CHAPTER_PARAMS = {
    "content-type": "json",
    "include-verse-numbers": "true",
    "include-titles": "true",
    "include-chapter-numbers": "false",
    "include-notes": "false",
}


@router.get("/bibles/{bible_id}/books/{book_id}/passage")
async def get_passage(
    bible_id: BibleId,
    book_id: BookId,
    client: BibleClientDep,
    start_chapter: ChapterQuery,
    start_verse: VerseQuery,
    end_chapter: ChapterQuery,
    end_verse: VerseQuery,
) -> Passage:
    """Fetch a verse range that may span chapters, up to a whole book.

    api.bible truncates long /passages requests without saying so, so each
    chapter is fetched whole and the ends of the range are trimmed here.
    """
    first, last = int(start_chapter), int(end_chapter)
    if last < first:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_chapter must not be before start_chapter.",
        )
    if last - first + 1 > MAX_CHAPTERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Range covers more than {MAX_CHAPTERS} chapters.",
        )

    chapters = [str(number) for number in range(first, last + 1)]
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHAPTERS)

    async def fetch(number: str) -> dict[str, Any]:
        async with semaphore:
            return await client.get(
                f"/bibles/{bible_id}/chapters/{book_id}.{number}", CHAPTER_PARAMS
            )

    results = await asyncio.gather(*(fetch(number) for number in chapters))

    paragraphs: list[Paragraph] = []
    for index, (number, data) in enumerate(zip(chapters, results, strict=True)):
        chapter_paragraphs = parse_content(data.get("content"))

        # Only the first and last chapters of the range are partial.
        chapter_paragraphs = trim_verses(
            chapter_paragraphs,
            first=int(start_verse) if index == 0 else None,
            last=int(end_verse) if index == len(chapters) - 1 else None,
        )

        if len(chapters) > 1:
            paragraphs.append(Paragraph(kind="chapter", style="c", heading=number))
        paragraphs.extend(chapter_paragraphs)

    head = results[0]
    # Chapter references look like "John 1"; drop the number to get the book.
    book_name = str(head.get("reference", "")).rsplit(" ", 1)[0]
    reference = f"{book_name} {start_chapter}:{start_verse}–{end_chapter}:{end_verse}"

    return Passage(
        reference=reference.strip(),
        copyright=head.get("copyright") or "",
        paragraphs=paragraphs,
    )

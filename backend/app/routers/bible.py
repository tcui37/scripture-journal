from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, status

from ..dependencies import CatalogDep, ProviderDep, TranslationDep
from ..schemas import BibleLimits, BibleSummary, Book, LanguageSummary, Passage
from ..usage_limits import allowance
from ..versification import verses_in_range

router = APIRouter(prefix="/api", tags=["bible"])

# Ids are our own slugs, so a tight pattern is safe.
BibleId = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.\-]{2,48}$")]
BookId = Annotated[str, Path(pattern=r"^[A-Z0-9]{3}$")]
ChapterNum = Annotated[str, Path(pattern=r"^\d{1,3}$")]
ChapterQuery = Annotated[str, Query(pattern=r"^\d{1,3}$")]
VerseQuery = Annotated[str, Query(pattern=r"^\d{1,3}$")]


def _summary(translation) -> BibleSummary:  # type: ignore[no-untyped-def]
    limits = translation.limits
    return BibleSummary(
        id=translation.id,
        label=translation.label,
        language=translation.language,
        language_name=translation.language_name,
        limits=None
        if limits.unrestricted
        else BibleLimits(
            max_verses=limits.max_verses,
            max_book_fraction=limits.max_book_fraction,
            exempt_single_chapter_books=limits.exempt_single_chapter_books,
            note=limits.note,
        ),
    )


@router.get("/languages")
async def list_languages(catalog: CatalogDep) -> list[LanguageSummary]:
    return [
        LanguageSummary(code=language.code, name=language.name, count=language.count)
        for language in await catalog.languages()
    ]


@router.get("/bibles")
async def list_bibles(
    catalog: CatalogDep,
    language: Annotated[str | None, Query(pattern=r"^[a-z]{2,8}$")] = None,
) -> list[BibleSummary]:
    return [_summary(entry) for entry in await catalog.translations(language)]


@router.get("/bibles/{bible_id}/books")
async def list_books(bible_id: BibleId, provider: ProviderDep) -> list[Book]:
    return await provider.list_books()


@router.get("/bibles/{bible_id}/books/{book_id}/chapters/{chapter}/verses")
async def list_verse_numbers(
    bible_id: BibleId, book_id: BookId, chapter: ChapterNum, provider: ProviderDep
) -> list[str]:
    return await provider.list_verse_numbers(book_id, chapter)


@router.get("/bibles/{bible_id}/books/{book_id}/passage")
async def get_passage(
    bible_id: BibleId,
    book_id: BookId,
    provider: ProviderDep,
    translation: TranslationDep,
    start_chapter: ChapterQuery,
    start_verse: VerseQuery,
    end_chapter: ChapterQuery,
    end_verse: VerseQuery,
) -> Passage:
    """A verse range that may span chapters, up to a whole book."""
    first, last = int(start_chapter), int(end_chapter)
    if last < first:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_chapter must not be before start_chapter.",
        )

    # Licensed translations cap how much may be shown at once.
    cap = allowance(translation.limits, book_id)
    if cap is not None:
        requested = verses_in_range(book_id, first, int(start_verse), last, int(end_verse))
        if requested > cap:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{translation.label} allows at most {cap} verses here; "
                    f"{requested} selected. {translation.limits.note}"
                ),
            )

    return await provider.get_passage(
        book_id, first, int(start_verse), last, int(end_verse)
    )

"""Per-translation caps on how much text may be shown at once.

Only licensed translations need these. Crossway's ESV terms permit at most 500
verses, or half a book, whichever is smaller — single-chapter books excepted.
The cap is enforced here and mirrored in the UI so the limit is visible before
a request is made rather than only after it fails.
"""

from dataclasses import dataclass

from .versification import book_verse_total, chapter_count


@dataclass(frozen=True)
class UsageLimits:
    max_verses: int | None = None
    max_book_fraction: float | None = None
    exempt_single_chapter_books: bool = False
    note: str = ""

    @property
    def unrestricted(self) -> bool:
        return self.max_verses is None and self.max_book_fraction is None


NO_LIMITS = UsageLimits()

ESV_LIMITS = UsageLimits(
    max_verses=500,
    max_book_fraction=0.5,
    exempt_single_chapter_books=True,
    note=(
        "Crossway permits at most 500 verses, or half a book, per passage. "
        "Single-chapter books may be shown in full."
    ),
)

# api.bible's acceptable-use terms require an application to "restrict printing
# the property more than 100 verses" for licensed content. Printing is the only
# thing this app does, so for api.bible translations that are not known to be
# public domain or openly licensed, 100 verses is the operative cap — it binds
# well before the publishers' own 500-verse permission clauses do.
#
# See https://api.bible/terms-and-conditions#acceptable_use. Which translations
# this applies to is declared in catalog.py; anything from api.bible whose
# licence is not known to be open is capped, since the terms require compliance
# "per individual content entity" and the catalogue does not report licence.
API_BIBLE_PRINT_LIMITS = UsageLimits(
    max_verses=100,
    exempt_single_chapter_books=False,
    note=(
        "api.bible's terms limit printing of licensed translations to 100 "
        "verses at a time. Public-domain translations are not restricted."
    ),
)


def allowance(limits: UsageLimits, book_id: str) -> int | None:
    """Largest number of verses of `book_id` this licence allows at once."""
    if limits.unrestricted:
        return None
    if limits.exempt_single_chapter_books and chapter_count(book_id) == 1:
        return None

    caps: list[int] = []
    if limits.max_verses is not None:
        caps.append(limits.max_verses)
    if limits.max_book_fraction is not None:
        # A zero total means the book is outside the canon we hold counts for,
        # so the fraction is unknown rather than zero — mirrors limits.ts.
        total = book_verse_total(book_id)
        if total > 0:
            caps.append(int(total * limits.max_book_fraction))
    return min(caps) if caps else None

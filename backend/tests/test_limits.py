"""Licence caps, versification arithmetic, and the single-user exemption.

These are the checks that keep the app inside the terms each source publishes,
so they are worth pinning down precisely — a cap that silently becomes zero or
None is the difference between a working download button and a broken one.
"""

import asyncio
import time

import pytest

from app.catalog import CURATED, _for_deployment
from app.config import Settings
from app.providers.base import chapter_verse_count
from app.providers.bible_api.client import _RateLimiter
from app.usage_limits import (
    API_BIBLE_PRINT_LIMITS,
    ESV_LIMITS,
    NO_LIMITS,
    allowance,
)
from app.versification import book_verse_total, chapter_count, verses_in_range

# ── versification ─────────────────────────────────────────────────────────


def test_verses_in_range_within_one_chapter():
    assert verses_in_range("JHN", 3, 16, 3, 17) == 2


def test_verses_in_range_spans_chapters():
    # John 1 has 51 verses, so 1:1-2:5 is 51 + 5.
    assert verses_in_range("JHN", 1, 1, 2, 5) == 56


def test_verses_in_range_clamps_past_the_end_of_a_chapter():
    assert verses_in_range("JHN", 1, 1, 1, 999) == 51


def test_verses_in_range_unknown_book_is_zero():
    assert verses_in_range("TOB", 1, 1, 1, 5) == 0


def test_whole_book_totals():
    assert book_verse_total("PSA") == 2461
    assert chapter_count("PSA") == 150
    assert chapter_count("PHM") == 1
    assert chapter_count("TOB") == 0


def test_chapter_verse_count():
    assert chapter_verse_count("JHN", "1") == 51
    assert chapter_verse_count("JHN", "99") == 0
    assert chapter_verse_count("JHN", "intro") == 0
    assert chapter_verse_count("TOB", "1") == 0


# ── caps ──────────────────────────────────────────────────────────────────


def test_no_limits_is_uncapped():
    assert allowance(NO_LIMITS, "JHN") is None


def test_esv_cap_is_the_smaller_of_500_and_half_a_book():
    # John: 879 verses, so half the book (439) binds before 500 does.
    assert allowance(ESV_LIMITS, "JHN") == 439
    # Psalms: half is 1230, so the 500-verse cap binds.
    assert allowance(ESV_LIMITS, "PSA") == 500


def test_esv_exempts_single_chapter_books():
    assert allowance(ESV_LIMITS, "PHM") is None


def test_api_bible_print_cap_applies_to_single_chapter_books():
    """Unlike Crossway, "not a complete book" leaves no exemption."""
    assert allowance(API_BIBLE_PRINT_LIMITS, "PHM") == 100
    assert allowance(API_BIBLE_PRINT_LIMITS, "JHN") == 100


def test_unknown_book_does_not_collapse_the_cap_to_zero():
    """A book with no known verse counts must not produce a cap of 0.

    Deriving half of an unknown total gives 0, which would reject every
    selection and grey out the download for no stated reason.
    """
    assert allowance(ESV_LIMITS, "TOB") == 500


# ── single-user exemption ─────────────────────────────────────────────────


def _curated(translation_id):
    return next(entry for entry in CURATED if entry.id == translation_id)


def test_shared_instance_keeps_every_cap():
    settings = Settings(single_user=False)
    assert _for_deployment(_curated("niv"), settings).limits == API_BIBLE_PRINT_LIMITS
    assert _for_deployment(_curated("esv"), settings).limits == ESV_LIMITS


def test_single_user_lifts_the_api_bible_print_cap():
    """api.bible §12 restricts *end users*; with none, it does not bind."""
    settings = Settings(single_user=True)
    for translation_id in ("niv", "nasb", "msg"):
        assert _for_deployment(_curated(translation_id), settings).limits == NO_LIMITS


def test_single_user_does_not_lift_the_esv_cap():
    """Crossway caps the licensee's own display, naming no end user."""
    settings = Settings(single_user=True)
    assert _for_deployment(_curated("esv"), settings).limits == ESV_LIMITS


def test_single_user_leaves_public_domain_entries_alone():
    settings = Settings(single_user=True)
    assert _for_deployment(_curated("kjv"), settings).limits == NO_LIMITS


# ── rate limiting ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rate_limiter_allows_a_burst_up_to_the_limit():
    limiter = _RateLimiter(limit=5, window=10.0)
    started = time.monotonic()
    await asyncio.gather(*(limiter.acquire() for _ in range(5)))
    assert time.monotonic() - started < 0.5  # no waiting yet


@pytest.mark.asyncio
async def test_rate_limiter_delays_once_the_window_is_full():
    """bible-api.com allows 15 requests per 30s; the 4th of 3-per-0.3s waits."""
    limiter = _RateLimiter(limit=3, window=0.3)
    for _ in range(3):
        await limiter.acquire()

    started = time.monotonic()
    await limiter.acquire()
    waited = time.monotonic() - started
    assert waited >= 0.2, f"expected to be paced, waited only {waited:.3f}s"

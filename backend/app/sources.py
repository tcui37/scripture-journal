"""Every upstream the app can read from, declared once.

Each `SourceSpec` says how trusted the source is, whether it is configured,
how to build its HTTP client, how to open one translation on it, and how long
its terms allow fetched text to be kept. The catalogue, the client pool and
the per-request provider all read from this table, so adding a source is one
provider package plus one entry here.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from .config import Settings
from .providers import (
    ApiBibleClient,
    ApiBibleSource,
    BibleApiClient,
    BibleApiSource,
    ChapterSource,
    EsvClient,
    EsvSource,
    HelloAoClient,
    HelloAoSource,
)

Source = Literal["api_bible", "esv", "bible_api", "helloao"]

DAY = 24 * 60 * 60

# api.bible's terms require cached content to be refreshed at least once every
# 30 days. https://api.bible/terms-and-conditions#acceptable_use
API_BIBLE_TTL = 29 * DAY
# The open sources set no limit; a month keeps corrections flowing through.
OPEN_SOURCE_TTL = 29 * DAY


@dataclass(frozen=True)
class SourceSpec:
    name: Source
    #: How the source is named in an error shown to the user.
    label: str
    #: Lower wins when two sources carry the same text.
    trust: int
    #: Seconds fetched books and chapters may be kept; None means never store.
    cache_ttl: float | None
    configured: Callable[[Settings], bool]
    build_client: Callable[[Settings], Any]
    #: (client, upstream id, new-testament-only) -> a source for one translation.
    open: Callable[[Any, str, bool], ChapterSource]


def _always(_: Settings) -> bool:
    return True


# Lower rank wins. First-party official APIs beat the licensed general
# catalog; helloao is the open/public-domain fallback; community mirrors
# (bible-api.com, and Bolls if it were ever added) are last resort.
# Bolls is not a source: no licence grant, and its popular CJK texts are
# either copyrighted or unusable flattened furigana.
SOURCES: dict[Source, SourceSpec] = {
    spec.name: spec
    for spec in (
        SourceSpec(
            name="esv",
            label="The ESV API",
            trust=0,
            # Crossway forbids storing more than 500 verses; never store any.
            cache_ttl=None,
            configured=lambda settings: bool(settings.esv_api_key),
            build_client=lambda settings: EsvClient(
                api_key=settings.esv_api_key, timeout=settings.request_timeout
            ),
            open=lambda client, upstream_id, nt_only: EsvSource(client),
        ),
        SourceSpec(
            name="api_bible",
            label="api.bible",
            trust=1,
            cache_ttl=API_BIBLE_TTL,
            configured=lambda settings: bool(settings.api_bible_key),
            build_client=lambda settings: ApiBibleClient(
                base_url=settings.api_bible_base_url,
                api_key=settings.api_bible_key,
                timeout=settings.request_timeout,
            ),
            open=lambda client, upstream_id, nt_only: ApiBibleSource(client, upstream_id),
        ),
        SourceSpec(
            name="helloao",
            label="bible.helloao.org",
            trust=2,
            cache_ttl=OPEN_SOURCE_TTL,
            configured=_always,
            build_client=lambda settings: HelloAoClient(timeout=settings.request_timeout),
            open=lambda client, upstream_id, nt_only: HelloAoSource(client, upstream_id),
        ),
        SourceSpec(
            name="bible_api",
            label="bible-api.com",
            trust=3,
            cache_ttl=OPEN_SOURCE_TTL,
            configured=_always,
            build_client=lambda settings: BibleApiClient(timeout=settings.request_timeout),
            open=lambda client, upstream_id, nt_only: BibleApiSource(
                client, upstream_id, new_testament_only=nt_only
            ),
        ),
    )
}

SOURCE_TRUST: dict[Source, int] = {name: spec.trust for name, spec in SOURCES.items()}

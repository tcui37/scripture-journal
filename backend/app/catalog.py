"""Every translation the app offers, and which upstream serves it.

Translations are addressed by a short id (`niv`, `esv`, `ao-BSB`), so upstream
identifiers never reach the URL or the browser. The curated entries below are
fixed; bible.helloao.org contributes a further thousand-odd translations that
are discovered at run time and prefixed `ao-`.
"""

import asyncio
from dataclasses import dataclass, replace
from typing import Any, Literal

from .config import Settings
from .providers.api_bible import ApiBibleClient
from .providers.helloao import HelloAoClient
from .usage_limits import (
    API_BIBLE_PRINT_LIMITS,
    ESV_LIMITS,
    NO_LIMITS,
    UsageLimits,
)

Source = Literal["api_bible", "esv", "bible_api", "helloao"]

HELLOAO_PREFIX = "ao-"
API_BIBLE_PREFIX = "ab-"
BIBLE_API_PREFIX = "ba-"


@dataclass(frozen=True)
class Translation:
    id: str
    label: str
    source: Source
    #: api.bible bible id, or the upstream translation code. Unused for ESV.
    upstream_id: str = ""
    language: str = "eng"
    language_name: str = "English"
    limits: UsageLimits = NO_LIMITS
    #: Upstream carries the New Testament only.
    new_testament_only: bool = False


@dataclass(frozen=True)
class Language:
    code: str
    name: str
    count: int = 0


# Curated sources. api.bible has the richest markup, so it leads.
#
# Only the copyright-reserved entries carry limits. api.bible's terms cap
# *printing* of licensed content at 100 verses, which is the binding constraint
# for this app, so the three modern translations below are capped; the
# public-domain ones (KJV, ASV, WEB, DRA, GNV) and the openly licensed FBV are
# not restricted and so are left uncapped.
CURATED: tuple[Translation, ...] = (
    Translation(
        "niv", "NIV — New International Version", "api_bible",
        "78a9f6124f344018-01", limits=API_BIBLE_PRINT_LIMITS,
    ),
    Translation("esv", "ESV — English Standard Version", "esv", limits=ESV_LIMITS),
    Translation(
        "nasb", "NASB — New American Standard Bible 1995", "api_bible",
        "b8ee27bcd1cae43a-01", limits=API_BIBLE_PRINT_LIMITS,
    ),
    Translation(
        "msg", "MSG — The Message", "api_bible",
        "6f11a7de016f942e-01", limits=API_BIBLE_PRINT_LIMITS,
    ),
    Translation("kjv", "KJV — King James Version", "api_bible", "de4e12af7f28f599-01"),
    Translation("asv", "ASV — American Standard Version", "api_bible", "06125adad2d5898a-01"),
    Translation("web", "WEB — World English Bible", "api_bible", "9879dbb7cfe39e4d-04"),
    Translation("lsv", "LSV — Literal Standard Version", "api_bible", "01b29f4b342acc35-01"),
    Translation("dra", "DRA — Douay-Rheims 1899", "api_bible", "179568874c45066f-01"),
    Translation("gnv", "GNV — Geneva Bible", "api_bible", "c315fa9f71d4af3a-01"),
    Translation("fbv", "FBV — Free Bible Version", "api_bible", "65eec8e0b60e656b-01"),
    # bible-api.com, for translations the others do not carry.
    Translation("bbe", "BBE — Bible in Basic English", "bible_api", "bbe"),
    Translation("darby", "DARBY — Darby Bible", "bible_api", "darby"),
    Translation("webbe", "WEBBE — World English Bible (British)", "bible_api", "webbe"),
    Translation("oeb", "OEB — Open English Bible", "bible_api", "oeb-us"),
    Translation("ylt", "YLT — Young's Literal (NT only)", "bible_api", "ylt", new_testament_only=True),
    # bible-api.com resolves references by English book name, so only its
    # translations that accept those are usable here. Other languages are
    # covered by helloao and api.bible instead.
    Translation(f"{BIBLE_API_PREFIX}almeida", "Almeida — João Ferreira de Almeida", "bible_api", "almeida", "por", "Portuguese"),
)


def _for_deployment(entry: Translation, settings: Settings) -> Translation:
    """Drop caps that only bind when the app has users other than its owner.

    api.bible's print cap comes from a clause about restricting *end users*, so
    it is lifted on a single-user instance. Crossway's cap restricts the
    licensee directly and is left in place either way.
    """
    if settings.single_user and entry.limits == API_BIBLE_PRINT_LIMITS:
        return replace(entry, limits=NO_LIMITS)
    return entry


def _is_configured(translation: Translation, settings: Settings) -> bool:
    if translation.source == "esv":
        return bool(settings.esv_api_key)
    if translation.source == "api_bible":
        return bool(settings.api_bible_key)
    return True  # bible-api.com and helloao need no credentials


CURATED_UPSTREAM = {entry.upstream_id for entry in CURATED if entry.source == "api_bible"}


def _from_api_bible(entry: dict[str, Any]) -> Translation | None:
    """A discovered api.bible entry, offered uncapped.

    The catalogue reports no licence status — `copyright` only arrives with a
    chapter — so there is no explicit cap to apply to these, and none is
    imposed. If a discovered translation turns out to be copyright-reserved,
    give it a curated entry above with `limits=API_BIBLE_PRINT_LIMITS`.
    """
    bible_id = entry.get("id")
    if not bible_id or bible_id in CURATED_UPSTREAM:
        return None  # already offered under a friendly slug

    language = entry.get("language") or {}
    short = entry.get("abbreviationLocal") or entry.get("abbreviation") or ""
    name = entry.get("nameLocal") or entry.get("name") or bible_id
    label = f"{short} — {name}" if short and short.lower() != name.lower() else name

    return Translation(
        id=f"{API_BIBLE_PREFIX}{bible_id}",
        label=label,
        source="api_bible",
        upstream_id=bible_id,
        language=language.get("id") or "und",
        language_name=language.get("name") or language.get("nameLocal") or "Unknown",
    )


def _from_helloao(entry: dict[str, Any]) -> Translation | None:
    upstream_id = entry.get("id")
    if not upstream_id:
        return None

    short = entry.get("shortName") or upstream_id
    name = entry.get("englishName") or entry.get("name") or upstream_id
    label = f"{short} — {name}" if short.lower() != name.lower() else name

    return Translation(
        id=f"{HELLOAO_PREFIX}{upstream_id}",
        label=label,
        source="helloao",
        upstream_id=upstream_id,
        language=entry.get("language") or "und",
        language_name=entry.get("languageEnglishName")
        or entry.get("languageName")
        or entry.get("language")
        or "Unknown",
    )


class Catalog:
    """Curated translations plus whatever helloao is currently serving."""

    def __init__(
        self,
        settings: Settings,
        helloao: HelloAoClient,
        api_bible: ApiBibleClient | None = None,
    ) -> None:
        self._settings = settings
        self._helloao = helloao
        self._api_bible = api_bible
        self._dynamic: dict[str, Translation] | None = None
        self._discovery_lock = asyncio.Lock()

    async def _discover(self) -> dict[str, Translation]:
        """Everything the upstream catalogues currently offer."""
        found: dict[str, Translation] = {}

        for client, convert in (
            (self._helloao, _from_helloao),
            (self._api_bible, _from_api_bible),
        ):
            if client is None:
                continue
            try:
                entries = await (
                    client.translations() if client is self._helloao else client.bibles()
                )
            except Exception:
                # A catalogue outage must not take the curated list down.
                continue
            for entry in entries:
                translation = convert(entry)
                if translation is not None:
                    found[translation.id] = translation

        return found

    async def _all(self) -> dict[str, Translation]:
        if self._dynamic is None:
            # The page issues /languages and /bibles together on load; without
            # the lock each would run its own discovery pass.
            async with self._discovery_lock:
                if self._dynamic is None:
                    self._dynamic = await self._discover()

        curated = {
            entry.id: _for_deployment(entry, self._settings)
            for entry in CURATED
            if _is_configured(entry, self._settings)
        }
        return {**curated, **self._dynamic}

    async def translations(self, language: str | None = None) -> list[Translation]:
        entries = (await self._all()).values()
        if language:
            entries = [entry for entry in entries if entry.language == language]
        # Curated first (they carry the best markup), then alphabetically.
        curated_ids = [entry.id for entry in CURATED]
        return sorted(
            entries,
            key=lambda entry: (
                curated_ids.index(entry.id) if entry.id in curated_ids else len(curated_ids),
                entry.label.lower(),
            ),
        )

    async def get(self, translation_id: str) -> Translation | None:
        return (await self._all()).get(translation_id)

    async def languages(self) -> list[Language]:
        counts: dict[str, Language] = {}
        for entry in (await self._all()).values():
            existing = counts.get(entry.language)
            counts[entry.language] = Language(
                code=entry.language,
                name=entry.language_name,
                count=(existing.count if existing else 0) + 1,
            )
        # English first, then by name.
        return sorted(
            counts.values(), key=lambda lang: (lang.code != "eng", lang.name.lower())
        )

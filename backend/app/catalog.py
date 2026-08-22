"""Every translation the app offers, and which upstream serves it.

Translations are addressed by a short id (`niv`, `esv`, `ao-BSB`), so upstream
identifiers never reach the URL or the browser. The curated entries below are
fixed; bible.helloao.org contributes a further thousand-odd translations that
are discovered at run time and prefixed `ao-`.

When more than one upstream carries the same text, only the most trusted
listing is kept. See `SOURCE_TRUST`.
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

# Lower rank wins. First-party official APIs beat the licensed general
# catalog; helloao is the open/public-domain fallback; community mirrors
# (bible-api.com, and Bolls if it were ever added) are last resort.
# Bolls is not a source: no licence grant, and its popular CJK texts are
# either copyrighted or unusable flattened furigana.
SOURCE_TRUST: dict[Source, int] = {
    "esv": 0,
    "api_bible": 1,
    "helloao": 2,
    "bible_api": 3,
}


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


@dataclass(frozen=True)
class _Upstream:
    source: Source
    upstream_id: str
    new_testament_only: bool = False


# Curated sources. The `source` / `upstream_id` on each row is one candidate;
# `_ALTERNATES` lists the others. `_resolve` picks by `SOURCE_TRUST` among
# whichever candidates are configured, so a missing api.bible key falls back
# to helloao instead of hiding the slug.
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
    # Open English texts helloao carries with markup; bible-api.com is fallback.
    Translation("bbe", "BBE — Bible in Basic English", "helloao", "eng_bbe"),
    Translation("darby", "DARBY — Darby Bible", "helloao", "eng_dby"),
    Translation("webbe", "WEBBE — World English Bible (British)", "bible_api", "webbe"),
    Translation("oeb", "OEB — Open English Bible", "bible_api", "oeb-us"),
    Translation("ylt", "YLT — Young's Literal Translation", "helloao", "eng_ylt"),
    # bible-api.com resolves references by English book name, so only its
    # translations that accept those are usable here. Other languages are
    # covered by helloao and api.bible instead.
    Translation(f"{BIBLE_API_PREFIX}almeida", "Almeida — João Ferreira de Almeida", "bible_api", "almeida", "por", "Portuguese"),
    # CJK. api.bible has OCCB (same Biblica open text) and not CUV / 개역 1910
    # / 新改訳 1965, so those three stay on helloao. RCUV, CNVT, 개역개정,
    # 新共同訳 and later 新改訳 are copyrighted and are not on any licensed
    # or keyless source we will use.
    Translation("cuvs", "CUV — 和合本（简体）", "helloao", "cmn_cu1", "cmn", "Chinese"),
    Translation("cuvt", "CUV — 和合本（繁體）", "helloao", "cmn_cuv", "cmn", "Chinese"),
    Translation("occb", "OCCB — 当代译本（简体）", "helloao", "cmn_cbs", "cmn", "Chinese"),
    Translation("occbt", "OCCB — 當代譯本（繁體）", "helloao", "cmn_cbt", "cmn", "Chinese"),
    Translation("krv1910", "개역 1910 — Korean Bible", "helloao", "kor_old", "kor", "Korean"),
    Translation(
        "jpn1965", "新改訳 1965 — New Japanese Bible (NT only)",
        "helloao", "jpn_loc", "jpn", "Japanese", new_testament_only=True,
    ),
)

# Other upstreams that serve the same edition as a curated slug. Order does
# not matter: `_resolve` sorts by `SOURCE_TRUST`. The CURATED row is merged
# in as a candidate too.
_ALTERNATES: dict[str, tuple[_Upstream, ...]] = {
    "kjv": (_Upstream("helloao", "eng_kjv"),),
    "asv": (_Upstream("helloao", "eng_asv"),),
    "web": (_Upstream("helloao", "ENGWEBP"),),
    "lsv": (_Upstream("helloao", "eng_lsv"),),
    "dra": (_Upstream("helloao", "eng_dra"),),
    "gnv": (_Upstream("helloao", "eng_gnv"),),
    "fbv": (_Upstream("helloao", "eng_fbv"),),
    "occb": (_Upstream("api_bible", "7ea794434e9ea7ee-01"),),
    "occbt": (_Upstream("api_bible", "a6e06d2c5b90ad89-01"),),
    "webbe": (
        _Upstream("api_bible", "7142879509583d59-04"),
        _Upstream("helloao", "eng_webpb"),
    ),
    "bbe": (_Upstream("bible_api", "bbe"),),
    "darby": (_Upstream("bible_api", "darby"),),
    "ylt": (_Upstream("bible_api", "ylt", new_testament_only=True),),
}


def _for_deployment(entry: Translation, settings: Settings) -> Translation:
    """Drop caps that only bind when the app has users other than its owner.

    api.bible's print cap comes from a clause about restricting *end users*, so
    it is lifted on a single-user instance. Crossway's cap restricts the
    licensee directly and is left in place either way.
    """
    if settings.single_user and entry.limits == API_BIBLE_PRINT_LIMITS:
        return replace(entry, limits=NO_LIMITS)
    return entry


def _source_available(source: Source, settings: Settings) -> bool:
    if source == "esv":
        return bool(settings.esv_api_key)
    if source == "api_bible":
        return bool(settings.api_bible_key)
    return True  # bible-api.com and helloao need no credentials


def _is_configured(translation: Translation, settings: Settings) -> bool:
    return _source_available(translation.source, settings)


def _resolve(entry: Translation, settings: Settings) -> Translation | None:
    """The most trusted configured upstream for a curated slug."""
    candidates = (
        _Upstream(entry.source, entry.upstream_id, entry.new_testament_only),
        *_ALTERNATES.get(entry.id, ()),
    )
    available = [choice for choice in candidates if _source_available(choice.source, settings)]
    if not available:
        return None
    # Same trust: the curated row wins (it is listed first).
    best = min(available, key=lambda choice: SOURCE_TRUST[choice.source])
    resolved = replace(
        entry,
        source=best.source,
        upstream_id=best.upstream_id,
        new_testament_only=best.new_testament_only,
    )
    return _for_deployment(resolved, settings)


def _register_work(work: str, *upstreams: tuple[str, str]) -> None:
    for source, upstream_id in upstreams:
        _KNOWN_WORKS[(source, upstream_id.lower())] = work


# Same-text aliases across upstreams. Used so a discovered `ao-eng_kjv`
# does not sit next to curated `kjv` once api.bible is configured.
_KNOWN_WORKS: dict[tuple[str, str], str] = {}
_register_work("occb", ("api_bible", "7ea794434e9ea7ee-01"), ("helloao", "cmn_cbs"))
_register_work("occbt", ("api_bible", "a6e06d2c5b90ad89-01"), ("helloao", "cmn_cbt"))
_register_work("feb", ("api_bible", "04fb2bec0d582d1f-01"), ("helloao", "cmn_feb"))
_register_work(
    "kjv",
    ("api_bible", "de4e12af7f28f599-01"),
    ("api_bible", "de4e12af7f28f599-02"),
    ("helloao", "eng_kjv"),
)
_register_work(
    "web",
    ("api_bible", "9879dbb7cfe39e4d-01"),
    ("api_bible", "9879dbb7cfe39e4d-02"),
    ("api_bible", "9879dbb7cfe39e4d-03"),
    ("api_bible", "9879dbb7cfe39e4d-04"),
    ("helloao", "ENGWEBP"),
)
_register_work(
    "webbe",
    ("api_bible", "7142879509583d59-01"),
    ("api_bible", "7142879509583d59-02"),
    ("api_bible", "7142879509583d59-03"),
    ("api_bible", "7142879509583d59-04"),
    ("helloao", "eng_webpb"),
    ("bible_api", "webbe"),
)
_register_work("asv", ("api_bible", "06125adad2d5898a-01"), ("helloao", "eng_asv"))
_register_work("dra", ("api_bible", "179568874c45066f-01"), ("helloao", "eng_dra"))
_register_work("fbv", ("api_bible", "65eec8e0b60e656b-01"), ("helloao", "eng_fbv"))
_register_work("gnv", ("api_bible", "c315fa9f71d4af3a-01"), ("helloao", "eng_gnv"))
_register_work("lsv", ("api_bible", "01b29f4b342acc35-01"), ("helloao", "eng_lsv"))
_register_work("bbe", ("helloao", "eng_bbe"), ("bible_api", "bbe"))
_register_work("darby", ("helloao", "eng_dby"), ("bible_api", "darby"))
_register_work("ylt", ("helloao", "eng_ylt"), ("bible_api", "ylt"))
_register_work("cuvs", ("helloao", "cmn_cu1"))
_register_work("cuvt", ("helloao", "cmn_cuv"))
_register_work("krv1910", ("helloao", "kor_old"))
_register_work("jpn1965", ("helloao", "jpn_loc"))
_register_work("oeb", ("bible_api", "oeb-us"))
_register_work("almeida", ("bible_api", "almeida"))


def _dbl_family(bible_id: str) -> str:
    """api.bible publication family (`de4e12af7f28f599-01` → `de4e12af…`)."""
    return bible_id.rsplit("-", 1)[0] if "-" in bible_id else bible_id


def _abbreviation(entry: Translation) -> str:
    head = entry.label.split(" — ", 1)[0].strip()
    return head.lower()


def _work_key(entry: Translation) -> str | None:
    known = _KNOWN_WORKS.get((entry.source, entry.upstream_id.lower()))
    if known:
        return known
    abbr = _abbreviation(entry)
    if 2 <= len(abbr) <= 12 and abbr.replace(" ", "").isalnum():
        return f"{entry.language}:{abbr}"
    return None


def _prefer(entries: list[Translation]) -> dict[str, Translation]:
    """One listing per work, keeping the more trusted source.

    Curated slugs win ties (same trust), so `kjv` is kept and `ab-…` is not.
    Sibling api.bible publication numbers of a family already served are dropped.
    """
    curated_ids = {item.id for item in CURATED}
    ordered = sorted(
        entries,
        key=lambda item: (
            SOURCE_TRUST[item.source],
            0 if item.id in curated_ids else 1,
            item.id,
        ),
    )
    kept: dict[str, Translation] = {}
    claimed_work: set[str] = set()
    claimed_dbl: set[str] = set()

    for entry in ordered:
        work = _work_key(entry)
        if work and work in claimed_work:
            continue
        if entry.source == "api_bible":
            family = _dbl_family(entry.upstream_id)
            if family in claimed_dbl:
                continue
        kept[entry.id] = entry
        if work:
            claimed_work.add(work)
        if entry.source == "api_bible" and entry.upstream_id:
            claimed_dbl.add(_dbl_family(entry.upstream_id))
    return kept


CURATED_UPSTREAM = {entry.upstream_id for entry in CURATED if entry.source == "api_bible"}
CURATED_HELLOAO_UPSTREAM = {
    entry.upstream_id for entry in CURATED if entry.source == "helloao"
}
# api.bible ids that a curated slug will claim when the key is present.
CURATED_UPSTREAM |= {
    choice.upstream_id
    for choices in _ALTERNATES.values()
    for choice in choices
    if choice.source == "api_bible"
}
CURATED_HELLOAO_UPSTREAM |= {
    choice.upstream_id
    for choices in _ALTERNATES.values()
    for choice in choices
    if choice.source == "helloao"
}


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
    short = entry.get("abbreviation") or entry.get("abbreviationLocal") or ""
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
    if not upstream_id or upstream_id in CURATED_HELLOAO_UPSTREAM:
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
    """Curated translations plus whatever higher-trust catalogues still add."""

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

    async def _discover(self) -> list[Translation]:
        """Upstream catalogue entries, not yet de-duplicated against curated."""
        found: list[Translation] = []

        for client, convert in (
            (self._api_bible, _from_api_bible),
            (self._helloao, _from_helloao),
        ):
            if client is None:
                continue
            try:
                entries = await (
                    client.bibles() if client is self._api_bible else client.translations()
                )
            except Exception:
                # A catalogue outage must not take the curated list down.
                continue
            for entry in entries:
                translation = convert(entry)
                if translation is not None:
                    found.append(translation)

        return found

    async def _all(self) -> dict[str, Translation]:
        if self._dynamic is None:
            # The page issues /languages and /bibles together on load; without
            # the lock each would run its own discovery pass.
            async with self._discovery_lock:
                if self._dynamic is None:
                    curated = [
                        resolved
                        for entry in CURATED
                        if (resolved := _resolve(entry, self._settings)) is not None
                    ]
                    discovered = await self._discover()
                    self._dynamic = _prefer([*curated, *discovered])

        return self._dynamic

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

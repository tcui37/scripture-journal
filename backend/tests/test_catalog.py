"""Translation ids, key gating, and discovery — no upstream is contacted.

A broken mapping would leak api.bible's long ids into the URL, list the NIV
twice, or offer a keyed source when the key is missing. Stubs stand in for
the helloao / api.bible catalogues.
"""

import pytest

from app.catalog import (
    CURATED,
    SOURCE_TRUST,
    Catalog,
    Translation,
    _from_api_bible,
    _from_helloao,
    _is_configured,
    _prefer,
    _resolve,
)
from app.config import Settings
from app.usage_limits import NO_LIMITS


def _curated(translation_id: str):
    return next(entry for entry in CURATED if entry.id == translation_id)


def _settings(**overrides: str) -> Settings:
    # Explicit empty keys so a developer's shell env cannot change the fixture.
    values = {"api_bible_key": "", "esv_api_key": "", **overrides}
    return Settings(**values)


# ── configuration gating ──────────────────────────────────────────────────


def test_keyed_sources_are_hidden_without_keys():
    settings = _settings()
    assert _is_configured(_curated("niv"), settings) is False
    assert _is_configured(_curated("esv"), settings) is False
    assert _is_configured(_curated("bbe"), settings) is True


def test_keyed_sources_appear_once_keys_are_set():
    settings = _settings(api_bible_key="test", esv_api_key="test")
    assert _is_configured(_curated("niv"), settings) is True
    assert _is_configured(_curated("esv"), settings) is True


def test_trust_order_is_official_then_api_bible_then_helloao():
    assert SOURCE_TRUST["esv"] < SOURCE_TRUST["api_bible"] < SOURCE_TRUST["helloao"]
    assert SOURCE_TRUST["helloao"] < SOURCE_TRUST["bible_api"]


# ── discovery conversion ──────────────────────────────────────────────────


def test_helloao_entry_is_prefixed_ao():
    translation = _from_helloao(
        {
            "id": "BSB",
            "shortName": "BSB",
            "englishName": "Berean Standard Bible",
            "language": "eng",
            "languageEnglishName": "English",
        }
    )
    assert translation is not None
    assert translation.id == "ao-BSB"
    assert translation.source == "helloao"
    assert translation.upstream_id == "BSB"


def test_helloao_skips_an_entry_with_no_id():
    assert _from_helloao({}) is None


def test_helloao_discovery_skips_curated_cjk_ids():
    """CUV is already offered as `cuvs` / `cuvt`; a second `ao-…` copy must not appear."""
    assert _from_helloao({"id": "cmn_cu1", "shortName": "CU1"}) is None
    assert _from_helloao({"id": "cmn_cuv", "shortName": "CUV"}) is None
    assert _from_helloao({"id": "kor_old", "shortName": "OLD"}) is None
    assert _from_helloao({"id": "jpn_loc", "shortName": "LOC"}) is None


def test_helloao_discovery_skips_curated_open_english_ids():
    assert _from_helloao({"id": "eng_bbe", "shortName": "BBE"}) is None
    assert _from_helloao({"id": "eng_dby", "shortName": "DBY"}) is None
    assert _from_helloao({"id": "eng_ylt", "shortName": "YLT"}) is None


def test_api_bible_discovery_skips_curated_ids():
    """The NIV is already offered as `niv`; a second `ab-…` copy must not appear."""
    assert _from_api_bible({"id": "78a9f6124f344018-01"}) is None


def test_api_bible_discovery_skips_ids_claimed_by_a_curated_slug():
    """OCCB / WEBBE keep their friendly slugs; the raw api.bible id is not listed."""
    assert _from_api_bible({"id": "7ea794434e9ea7ee-01"}) is None
    assert _from_api_bible({"id": "a6e06d2c5b90ad89-01"}) is None
    assert _from_api_bible({"id": "7142879509583d59-04"}) is None


def test_api_bible_discovery_keeps_feb():
    """FEB is not a curated slug, so api.bible's copy is the listing to keep."""
    translation = _from_api_bible(
        {
            "id": "04fb2bec0d582d1f-01",
            "abbreviation": "FEB",
            "name": "Free Easy-to-read Bible",
            "language": {"id": "cmn", "name": "Chinese"},
        }
    )
    assert translation is not None
    assert translation.source == "api_bible"
    assert translation.upstream_id == "04fb2bec0d582d1f-01"


def test_api_bible_discovery_is_prefixed_and_uncapped():
    """The catalogue does not report licence, so discovered entries stay open."""
    translation = _from_api_bible(
        {
            "id": "deadbeef-01",
            "abbreviationLocal": "XYZ",
            "nameLocal": "Example Bible",
            "language": {"id": "spa", "name": "Spanish"},
        }
    )
    assert translation is not None
    assert translation.id == "ab-deadbeef-01"
    assert translation.source == "api_bible"
    assert translation.limits == NO_LIMITS
    assert translation.language == "spa"


# ── source preference ─────────────────────────────────────────────────────


def test_occb_uses_api_bible_when_the_key_is_set():
    resolved = _resolve(_curated("occb"), _settings(api_bible_key="test"))
    assert resolved is not None
    assert resolved.id == "occb"
    assert resolved.source == "api_bible"
    assert resolved.upstream_id == "7ea794434e9ea7ee-01"


def test_occb_falls_back_to_helloao_without_a_key():
    resolved = _resolve(_curated("occb"), _settings())
    assert resolved is not None
    assert resolved.source == "helloao"
    assert resolved.upstream_id == "cmn_cbs"


def test_webbe_uses_api_bible_when_the_key_is_set():
    resolved = _resolve(_curated("webbe"), _settings(api_bible_key="test"))
    assert resolved is not None
    assert resolved.source == "api_bible"
    assert resolved.upstream_id == "7142879509583d59-04"


def test_webbe_falls_back_to_helloao_without_a_key():
    resolved = _resolve(_curated("webbe"), _settings())
    assert resolved is not None
    assert resolved.source == "helloao"
    assert resolved.upstream_id == "eng_webpb"


def test_cuv_and_korean_japanese_stay_on_helloao():
    """api.bible does not serve these editions; do not pretend it does."""
    settings = _settings(api_bible_key="test")
    assert _resolve(_curated("cuvs"), settings).source == "helloao"
    assert _resolve(_curated("cuvt"), settings).source == "helloao"
    assert _resolve(_curated("krv1910"), settings).source == "helloao"
    assert _resolve(_curated("jpn1965"), settings).source == "helloao"


def test_bbe_and_ylt_come_from_helloao():
    settings = _settings()
    bbe = _resolve(_curated("bbe"), settings)
    ylt = _resolve(_curated("ylt"), settings)
    assert bbe.source == "helloao" and bbe.upstream_id == "eng_bbe"
    assert ylt.source == "helloao" and ylt.new_testament_only is False


def test_kjv_prefers_api_bible_over_helloao_when_keyed():
    resolved = _resolve(_curated("kjv"), _settings(api_bible_key="test"))
    assert resolved is not None
    assert resolved.source == "api_bible"
    assert resolved.upstream_id == "de4e12af7f28f599-01"


def test_kjv_falls_back_to_helloao_without_a_key():
    resolved = _resolve(_curated("kjv"), _settings())
    assert resolved is not None
    assert resolved.source == "helloao"
    assert resolved.upstream_id == "eng_kjv"


def test_occbt_uses_api_bible_when_the_key_is_set():
    resolved = _resolve(_curated("occbt"), _settings(api_bible_key="test"))
    assert resolved is not None
    assert resolved.source == "api_bible"
    assert resolved.upstream_id == "a6e06d2c5b90ad89-01"


def test_prefer_keeps_api_bible_and_drops_the_helloao_duplicate():
    kept = _prefer(
        [
            Translation("ao-cmn_feb", "FEB — Easy-to-read", "helloao", "cmn_feb", "cmn", "Chinese"),
            Translation(
                "ab-04fb2bec0d582d1f-01",
                "FEB — Free Easy-to-read Bible",
                "api_bible",
                "04fb2bec0d582d1f-01",
                "cmn",
                "Chinese",
            ),
        ]
    )
    assert list(kept) == ["ab-04fb2bec0d582d1f-01"]


def test_prefer_drops_helloao_kjv_once_curated_kjv_is_present():
    kept = _prefer(
        [
            _curated("kjv"),
            Translation("ao-eng_kjv", "KJAV — King James Version", "helloao", "eng_kjv"),
        ]
    )
    assert list(kept) == ["kjv"]


def test_prefer_drops_sibling_api_bible_publications():
    kept = _prefer(
        [
            _curated("web"),
            Translation(
                "ab-9879dbb7cfe39e4d-01",
                "WEB — World English Bible",
                "api_bible",
                "9879dbb7cfe39e4d-01",
            ),
        ]
    )
    assert list(kept) == ["web"]


# ── Catalog assembly ──────────────────────────────────────────────────────


class RaisingHelloAo:
    async def translations(self) -> list[dict]:
        raise RuntimeError("catalogue down")


class StubHelloAo:
    def __init__(self, entries: list[dict] | None = None) -> None:
        self._entries = entries or [
            {
                "id": "BSB",
                "shortName": "BSB",
                "englishName": "Berean Standard Bible",
                "language": "eng",
                "languageEnglishName": "English",
            }
        ]

    async def translations(self) -> list[dict]:
        return self._entries


class StubApiBible:
    def __init__(self, entries: list[dict] | None = None) -> None:
        self._entries = entries or []

    async def bibles(self) -> list[dict]:
        return self._entries


@pytest.mark.asyncio
async def test_catalogue_outage_keeps_curated_keyless_entries():
    catalog = Catalog(_settings(), RaisingHelloAo(), None)  # type: ignore[arg-type]
    ids = {entry.id for entry in await catalog.translations()}
    assert "bbe" in ids
    assert "ba-almeida" in ids
    # No keys, so the metered / keyed sources stay hidden.
    assert "niv" not in ids
    assert "esv" not in ids


@pytest.mark.asyncio
async def test_catalogue_discovers_helloao_and_filters_by_language():
    catalog = Catalog(_settings(), StubHelloAo(), None)  # type: ignore[arg-type]
    english = await catalog.translations("eng")
    assert any(entry.id == "ao-BSB" for entry in english)

    portuguese = await catalog.translations("por")
    assert {entry.id for entry in portuguese} == {"ba-almeida"}


@pytest.mark.asyncio
async def test_get_returns_none_for_an_unknown_id():
    catalog = Catalog(_settings(), RaisingHelloAo(), None)  # type: ignore[arg-type]
    assert await catalog.get("nope") is None
    assert (await catalog.get("bbe")) is not None


@pytest.mark.asyncio
async def test_languages_lists_english_first():
    catalog = Catalog(_settings(), RaisingHelloAo(), None)  # type: ignore[arg-type]
    languages = await catalog.languages()
    assert languages[0].code == "eng"
    assert {lang.code for lang in languages} >= {"eng", "por", "cmn", "kor", "jpn"}


def test_curated_cjk_entries_use_friendly_slugs():
    cuvs = _curated("cuvs")
    assert cuvs.source == "helloao" and cuvs.upstream_id == "cmn_cu1"
    assert cuvs.language == "cmn" and "和合本" in cuvs.label
    assert _curated("cuvt").upstream_id == "cmn_cuv"
    assert _curated("krv1910").language == "kor"
    assert _curated("jpn1965").language == "jpn"
    assert _curated("jpn1965").new_testament_only is True


@pytest.mark.asyncio
async def test_cjk_curated_entries_survive_a_catalogue_outage():
    catalog = Catalog(_settings(), RaisingHelloAo(), None)  # type: ignore[arg-type]
    chinese = await catalog.translations("cmn")
    assert {entry.id for entry in chinese} >= {"cuvs", "cuvt", "occb", "occbt"}
    assert {entry.id for entry in await catalog.translations("kor")} == {"krv1910"}
    assert {entry.id for entry in await catalog.translations("jpn")} == {"jpn1965"}
    assert (await catalog.get("occb")).source == "helloao"


@pytest.mark.asyncio
async def test_occb_listing_switches_to_api_bible_without_a_second_copy():
    catalog = Catalog(
        _settings(api_bible_key="test"),
        StubHelloAo(
            [
                {
                    "id": "cmn_cbs",
                    "shortName": "CBS",
                    "englishName": "Open Contemporary Bible",
                    "language": "cmn",
                    "languageEnglishName": "Chinese",
                }
            ]
        ),
        StubApiBible(
            [
                {
                    "id": "7ea794434e9ea7ee-01",
                    "abbreviation": "OCCB",
                    "nameLocal": "当代译本",
                    "language": {"id": "cmn", "name": "Chinese"},
                }
            ]
        ),
    )  # type: ignore[arg-type]
    chinese = await catalog.translations("cmn")
    occb = [entry for entry in chinese if "OCCB" in entry.label or entry.id.startswith("occb")]
    assert {entry.id for entry in occb} == {"occb", "occbt"}
    assert (await catalog.get("occb")).source == "api_bible"
    assert not any(entry.id.startswith("ao-") or entry.id.startswith("ab-") for entry in occb)


@pytest.mark.asyncio
async def test_helloao_feb_is_hidden_when_api_bible_has_it():
    catalog = Catalog(
        _settings(api_bible_key="test"),
        StubHelloAo(
            [
                {
                    "id": "cmn_feb",
                    "shortName": "FEB",
                    "englishName": "Free Easy-to-read Bible",
                    "language": "cmn",
                    "languageEnglishName": "Chinese",
                }
            ]
        ),
        StubApiBible(
            [
                {
                    "id": "04fb2bec0d582d1f-01",
                    "abbreviation": "FEB",
                    "name": "Free Easy-to-read Bible",
                    "language": {"id": "cmn", "name": "Chinese"},
                }
            ]
        ),
    )  # type: ignore[arg-type]
    chinese = await catalog.translations("cmn")
    feb = [entry for entry in chinese if "FEB" in entry.label]
    assert len(feb) == 1
    assert feb[0].source == "api_bible"

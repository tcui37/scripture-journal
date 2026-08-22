"""Translation ids, key gating, and discovery — no upstream is contacted.

A broken mapping would leak api.bible's long ids into the URL, list the NIV
twice, or offer a keyed source when the key is missing. Stubs stand in for
the helloao / api.bible catalogues.
"""

import pytest

from app.catalog import (
    CURATED,
    Catalog,
    _from_api_bible,
    _from_helloao,
    _is_configured,
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


def test_api_bible_discovery_skips_curated_ids():
    """The NIV is already offered as `niv`; a second `ab-…` copy must not appear."""
    assert _from_api_bible({"id": "78a9f6124f344018-01"}) is None


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


# ── Catalog assembly ──────────────────────────────────────────────────────


class RaisingHelloAo:
    async def translations(self) -> list[dict]:
        raise RuntimeError("catalogue down")


class StubHelloAo:
    async def translations(self) -> list[dict]:
        return [
            {
                "id": "BSB",
                "shortName": "BSB",
                "englishName": "Berean Standard Bible",
                "language": "eng",
                "languageEnglishName": "English",
            }
        ]


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
    assert {lang.code for lang in languages} >= {"eng", "por"}

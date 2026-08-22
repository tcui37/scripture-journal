"""Router validation: reversed ranges, licence caps, unknown ids.

These are the last checks before a provider is asked to fetch. The app is
built without a lifespan and both catalogue and provider are fakes, so no
HTTP client is constructed and api.bible is never contacted.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.catalog import Translation
from app.dependencies import get_catalog, get_provider
from app.routers import bible
from app.schemas import Passage
from app.usage_limits import API_BIBLE_PRINT_LIMITS, NO_LIMITS

NIV = Translation(
    "niv",
    "NIV — New International Version",
    "api_bible",
    "unused",
    limits=API_BIBLE_PRINT_LIMITS,
)
BBE = Translation("bbe", "BBE — Bible in Basic English", "bible_api", "bbe", limits=NO_LIMITS)


class FakeCatalog:
    def __init__(self, translations: dict[str, Translation]) -> None:
        self._translations = translations

    async def get(self, translation_id: str) -> Translation | None:
        return self._translations.get(translation_id)


class RecordingProvider:
    """Raises if get_passage is reached when the router should have rejected."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, int, int, int, int]] = []

    async def get_passage(
        self,
        book_id: str,
        start_chapter: int,
        start_verse: int,
        end_chapter: int,
        end_verse: int,
    ) -> Passage:
        self.calls.append((book_id, start_chapter, start_verse, end_chapter, end_verse))
        return Passage(reference="ok", copyright="", paragraphs=[])


def _client(provider: RecordingProvider) -> TestClient:
    app = FastAPI()
    app.include_router(bible.router)
    catalog = FakeCatalog({"niv": NIV, "bbe": BBE})
    app.dependency_overrides[get_catalog] = lambda: catalog
    app.dependency_overrides[get_provider] = lambda: provider
    return TestClient(app)


def _passage(client: TestClient, bible_id: str, **query: str):
    return client.get(f"/api/bibles/{bible_id}/books/JHN/passage", params=query)


def test_reversed_chapters_are_rejected_before_fetch():
    provider = RecordingProvider()
    response = _passage(
        _client(provider),
        "bbe",
        start_chapter="3",
        start_verse="1",
        end_chapter="1",
        end_verse="1",
    )
    assert response.status_code == 422
    assert "end_chapter" in response.json()["detail"]
    assert provider.calls == []


def test_oversize_licensed_range_is_rejected_before_fetch():
    """John 1:1-3:36 is 112 verses; NIV's print cap is 100."""
    provider = RecordingProvider()
    response = _passage(
        _client(provider),
        "niv",
        start_chapter="1",
        start_verse="1",
        end_chapter="3",
        end_verse="36",
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "100" in detail and "112" in detail
    assert provider.calls == []


def test_uncapped_translation_is_not_blocked_by_the_print_cap():
    provider = RecordingProvider()
    response = _passage(
        _client(provider),
        "bbe",
        start_chapter="1",
        start_verse="1",
        end_chapter="3",
        end_verse="36",
    )
    assert response.status_code == 200
    assert provider.calls == [("JHN", 1, 1, 3, 36)]


def test_legal_licensed_range_reaches_the_provider():
    provider = RecordingProvider()
    response = _passage(
        _client(provider),
        "niv",
        start_chapter="3",
        start_verse="16",
        end_chapter="3",
        end_verse="17",
    )
    assert response.status_code == 200
    assert provider.calls == [("JHN", 3, 16, 3, 17)]


def test_unknown_translation_is_404():
    provider = RecordingProvider()
    response = _passage(
        _client(provider),
        "nope",
        start_chapter="1",
        start_verse="1",
        end_chapter="1",
        end_verse="1",
    )
    assert response.status_code == 404
    assert "nope" in response.json()["detail"]
    assert provider.calls == []

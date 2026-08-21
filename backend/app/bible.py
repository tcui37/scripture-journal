"""Thin async client for api.bible.

Keeps the API key server-side and normalises upstream failures into HTTP errors
the frontend can display.
"""

from typing import Any

import httpx
from fastapi import HTTPException, status

# The English translations offered in the UI, in the order they appear.
ENGLISH_BIBLES: list[tuple[str, str]] = [
    ("78a9f6124f344018-01", "NIV — New International Version"),
    ("de4e12af7f28f599-01", "KJV — King James Version"),
    ("06125adad2d5898a-01", "ASV — American Standard"),
    ("9879dbb7cfe39e4d-04", "WEB — World English Bible"),
    ("01b29f4b342acc35-01", "LSV — Literal Standard"),
    ("179568874c45066f-01", "DRA — Douay-Rheims 1899"),
    ("c315fa9f71d4af3a-01", "GNV — Geneva Bible"),
    ("65eec8e0b60e656b-01", "FBV — Free Bible Version"),
]


# api.bible silently truncates long /passages requests, so a range is fetched
# one chapter at a time. These bound how much work a single request can cause.
MAX_CHAPTERS = 150  # Psalms, the longest book
MAX_CONCURRENT_CHAPTERS = 8


class BibleClient:
    def __init__(self, *, base_url: str, api_key: str, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"api-key": api_key, "accept": "application/json"},
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET an api.bible path and return its `data` payload."""
        try:
            response = await self._client.get(path, params=params)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"Could not reach api.bible: {exc}",
            ) from exc

        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="api.bible rejected the API key. Check API_BIBLE_KEY.",
            )
        if response.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No such Bible, book, chapter or passage.",
            )
        if response.is_error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"api.bible returned HTTP {response.status_code}.",
            )

        return response.json().get("data")

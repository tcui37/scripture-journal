"""HTTP client for the Free Use Bible API (bible.helloao.org).

Public domain and openly licensed translations, no credentials required.
"""

import asyncio
from typing import Any

import httpx
from fastapi import HTTPException, status

HELLOAO_BASE_URL = "https://bible.helloao.org/api"


class HelloAoClient:
    def __init__(self, *, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=HELLOAO_BASE_URL,
            headers={"accept": "application/json"},
            timeout=timeout,
        )
        self._translations: list[dict[str, Any]] | None = None
        self._translations_lock = asyncio.Lock()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get(self, path: str) -> Any:
        try:
            response = await self._client.get(path)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"Could not reach bible.helloao.org: {exc}",
            ) from exc

        if response.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No such translation, book or chapter.",
            )
        if response.is_error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"bible.helloao.org returned HTTP {response.status_code}.",
            )
        return response.json()

    async def translations(self) -> list[dict[str, Any]]:
        """The catalogue, fetched once and kept for the process lifetime.

        The lock matters on a cold start: the catalogue is ~1,250 entries and
        several requests can arrive before the first fetch returns.
        """
        if self._translations is not None:
            return self._translations
        async with self._translations_lock:
            if self._translations is None:
                data = await self.get("/available_translations.json")
                self._translations = data.get("translations") or []
        return self._translations

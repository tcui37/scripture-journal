"""HTTP client for api.bible."""

import asyncio
from typing import Any

import httpx
from fastapi import HTTPException, status


class ApiBibleClient:
    def __init__(self, *, base_url: str, api_key: str, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"api-key": api_key, "accept": "application/json"},
            timeout=timeout,
        )
        self._bibles: list[dict[str, Any]] | None = None
        self._bibles_lock = asyncio.Lock()

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

    async def bibles(self) -> list[dict[str, Any]]:
        """Every Bible this key can read, fetched once."""
        if self._bibles is not None:
            return self._bibles
        async with self._bibles_lock:
            if self._bibles is None:
                self._bibles = await self.get("/bibles") or []
        return self._bibles

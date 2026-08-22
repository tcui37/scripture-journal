"""HTTP client for api.bible."""

import asyncio
import time
from collections import OrderedDict
from typing import Any

import httpx
from fastapi import HTTPException, status

# api.bible bills per request against a monthly quota, so chapter payloads are
# cached. The bound keeps a long-running process from growing without limit:
# 512 chapters is more than three whole books, and evicting the least recently
# used one costs at most a single refetch.
MAX_CACHED_CHAPTERS = 512

# api.bible's terms require cached content to be refreshed at least once every
# 30 days. A process rarely lives that long, but the cache has no other expiry,
# so the obligation is enforced here rather than assumed away.
# https://api.bible/terms-and-conditions#acceptable_use
CACHE_TTL_SECONDS = 29 * 24 * 60 * 60


class ApiBibleClient:
    def __init__(self, *, base_url: str, api_key: str, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"api-key": api_key, "accept": "application/json"},
            timeout=timeout,
        )
        self._bibles: list[dict[str, Any]] | None = None
        self._bibles_lock = asyncio.Lock()
        #: path -> (fetched_at, payload)
        self._chapters: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        #: In-flight chapter fetches, so concurrent readers share one request.
        self._pending: dict[str, asyncio.Task[Any]] = {}

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

    async def get_cached(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """As `get`, but memoised — used for chapter text, which never changes.

        Concurrent callers asking for the same chapter share one upstream
        request rather than each paying for it. The fetch is shielded so a
        caller giving up (a disconnected browser) does not cancel it for the
        others still waiting.
        """
        cached = self._chapters.get(path)
        if cached is not None:
            fetched_at, payload = cached
            if time.monotonic() - fetched_at < CACHE_TTL_SECONDS:
                self._chapters.move_to_end(path)
                return payload
            del self._chapters[path]  # stale under the 30-day refresh rule

        task = self._pending.get(path)
        if task is None:
            task = asyncio.create_task(self.get(path, params))
            self._pending[path] = task
            task.add_done_callback(lambda _: self._pending.pop(path, None))

        data = await asyncio.shield(task)

        self._chapters[path] = (time.monotonic(), data)
        if len(self._chapters) > MAX_CACHED_CHAPTERS:
            self._chapters.popitem(last=False)
        return data

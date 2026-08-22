"""HTTP client for bible-api.com (no credentials required).

The upstream is one person's server, rate limited to 15 requests every 30
seconds per IP and explicitly asking not to be used to bulk-download a Bible.
A multi-chapter passage would otherwise burst straight past that, so requests
are paced here rather than only being retried after a 429.
"""

import asyncio
import time
from collections import deque
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

BIBLE_API_BASE_URL = "https://bible-api.com"

# The published limit, kept one under to leave room for clock skew.
RATE_LIMIT_REQUESTS = 14
RATE_LIMIT_WINDOW = 30.0


class _RateLimiter:
    """Lets at most `limit` requests start in any `window` seconds."""

    def __init__(self, limit: int, window: float) -> None:
        self._limit = limit
        self._window = window
        self._started: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        # The lock is held across the sleep so waiters queue in order and each
        # re-checks the window rather than all waking at once.
        async with self._lock:
            while True:
                now = time.monotonic()
                while self._started and now - self._started[0] >= self._window:
                    self._started.popleft()
                if len(self._started) < self._limit:
                    self._started.append(now)
                    return
                await asyncio.sleep(self._window - (now - self._started[0]))


class BibleApiClient:
    def __init__(self, *, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=BIBLE_API_BASE_URL,
            headers={"accept": "application/json"},
            timeout=timeout,
        )
        self._limiter = _RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def passage(self, reference: str, translation: str) -> dict[str, Any]:
        await self._limiter.acquire()
        try:
            response = await self._client.get(
                f"/{quote(reference)}", params={"translation": translation}
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"Could not reach bible-api.com: {exc}",
            ) from exc

        if response.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"bible-api.com has no text for {reference}.",
            )
        if response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="bible-api.com rate limit reached. It allows 15 requests "
                "every 30 seconds; try a shorter range.",
            )
        if response.is_error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"bible-api.com returned HTTP {response.status_code}.",
            )
        return response.json()

"""Where fetched upstream data is kept between requests.

Every upstream answers a chapter (or a book list) the same way each time, and
api.bible bills per request, so each fetch is worth keeping — within what the
source's terms allow. That allowance is a per-source TTL from the source
registry: `None` means never store (Crossway forbids keeping ESV text), and
api.bible's terms require a refresh at least every 30 days.

Two tiers: a bounded in-process LRU, which is all a local process needs, and
an optional persistent backend shared by every serverless instance, so a cold
start does not re-buy what another instance already fetched. Values are plain
JSON so either tier can hold them.
"""

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

# 2048 chapters is more than ten whole books; evicting the least recently used
# entry costs at most a single refetch (or a persistent-tier read).
MAX_MEMORY_ENTRIES = 2048


class PersistentCache(Protocol):
    async def get(self, key: str) -> tuple[Any, float] | None:
        """(value, expires_at epoch seconds), or None when absent or expired."""
        ...

    async def set(self, key: str, value: Any, ttl: float) -> None: ...


class Store:
    def __init__(
        self,
        persistent: PersistentCache | None = None,
        *,
        max_entries: int = MAX_MEMORY_ENTRIES,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._persistent = persistent
        self._max_entries = max_entries
        self._clock = clock
        #: key -> (expires_at, value)
        self._memory: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        #: In-flight loads, so concurrent readers share one upstream request.
        self._pending: dict[str, asyncio.Task[Any]] = {}

    async def get_or_load(
        self, key: str, ttl: float | None, load: Callable[[], Awaitable[Any]]
    ) -> Any:
        """The value for `key`, loading (and keeping, if `ttl`) it on a miss.

        Concurrent callers for the same key share one load even when nothing
        may be stored. The load is shielded so one caller giving up (a
        disconnected browser) does not cancel it for the others.
        """
        if ttl is not None:
            hit = self._memory_get(key)
            if hit is not None:
                return hit

        task = self._pending.get(key)
        if task is None:
            task = asyncio.create_task(self._load(key, ttl, load))
            self._pending[key] = task
            task.add_done_callback(lambda _: self._pending.pop(key, None))
        return await asyncio.shield(task)

    async def _load(
        self, key: str, ttl: float | None, load: Callable[[], Awaitable[Any]]
    ) -> Any:
        if ttl is not None and self._persistent is not None:
            try:
                stored = await self._persistent.get(key)
            except Exception:
                stored = None  # a cache outage must not take reading down
            if stored is not None:
                # Keep the persisted expiry: a value read back on day 28 must
                # not get a fresh 29 days in memory.
                value, expires_at = stored
                self._memory_put(key, value, expires_at)
                return value

        value = await load()

        if ttl is not None:
            self._memory_set(key, value, ttl)
            if self._persistent is not None:
                try:
                    await self._persistent.set(key, value, ttl)
                except Exception:
                    pass  # served either way; the next instance just refetches
        return value

    def _memory_get(self, key: str) -> Any | None:
        entry = self._memory.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._memory[key]
            return None
        self._memory.move_to_end(key)
        return value

    def _memory_set(self, key: str, value: Any, ttl: float) -> None:
        self._memory_put(key, value, self._clock() + ttl)

    def _memory_put(self, key: str, value: Any, expires_at: float) -> None:
        self._memory[key] = (expires_at, value)
        self._memory.move_to_end(key)
        while len(self._memory) > self._max_entries:
            self._memory.popitem(last=False)

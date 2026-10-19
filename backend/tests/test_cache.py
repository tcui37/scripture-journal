"""The two-tier store: what is kept, for how long, and what an outage does."""

import pytest

from app.cache import Store


class Clock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


class Loader:
    def __init__(self) -> None:
        self.calls = 0

    async def __call__(self) -> dict:
        self.calls += 1
        return {"n": self.calls}


class MemoryBackend:
    def __init__(self, clock: Clock) -> None:
        self.clock = clock
        self.rows: dict[str, tuple[dict, float]] = {}

    async def get(self, key: str):
        row = self.rows.get(key)
        if row is None or row[1] <= self.clock():
            return None
        return row

    async def set(self, key: str, value, ttl: float) -> None:
        self.rows[key] = (value, self.clock() + ttl)


class BrokenBackend:
    async def get(self, key: str):
        raise RuntimeError("database down")

    async def set(self, key: str, value, ttl: float) -> None:
        raise RuntimeError("database down")


@pytest.mark.asyncio
async def test_memory_hit_until_the_ttl_runs_out():
    clock, load = Clock(), Loader()
    store = Store(clock=clock)

    assert await store.get_or_load("k", 10, load) == {"n": 1}
    assert await store.get_or_load("k", 10, load) == {"n": 1}
    clock.now += 11
    assert await store.get_or_load("k", 10, load) == {"n": 2}


@pytest.mark.asyncio
async def test_no_ttl_means_nothing_is_kept_anywhere():
    clock, load = Clock(), Loader()
    backend = MemoryBackend(clock)
    store = Store(backend, clock=clock)

    await store.get_or_load("esv", None, load)
    await store.get_or_load("esv", None, load)

    assert load.calls == 2
    assert backend.rows == {}


@pytest.mark.asyncio
async def test_a_cold_instance_reads_what_another_stored():
    clock, load = Clock(), Loader()
    backend = MemoryBackend(clock)

    await Store(backend, clock=clock).get_or_load("k", 10, load)
    assert await Store(backend, clock=clock).get_or_load("k", 10, load) == {"n": 1}
    assert load.calls == 1


@pytest.mark.asyncio
async def test_persisted_expiry_is_not_renewed_in_memory():
    """Read back near the end of its life, a value must still expire on time."""
    clock, load = Clock(), Loader()
    backend = MemoryBackend(clock)
    await Store(backend, clock=clock).get_or_load("k", 10, load)

    clock.now += 8
    cold = Store(backend, clock=clock)
    await cold.get_or_load("k", 10, load)  # from the backend, 2s left
    clock.now += 3
    assert await cold.get_or_load("k", 10, load) == {"n": 2}


@pytest.mark.asyncio
async def test_a_broken_backend_still_serves():
    load = Loader()
    store = Store(BrokenBackend())

    assert await store.get_or_load("k", 10, load) == {"n": 1}
    assert await store.get_or_load("k", 10, load) == {"n": 1}  # memory tier
    assert load.calls == 1


@pytest.mark.asyncio
async def test_memory_is_bounded():
    load = Loader()
    store = Store(max_entries=2)

    for key in ("a", "b", "c"):
        await store.get_or_load(key, 10, load)
    await store.get_or_load("a", 10, load)  # evicted, so loaded again

    assert load.calls == 4

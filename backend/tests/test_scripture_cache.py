"""The Supabase tier speaks PostgREST correctly, without a real database."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.persistence.scripture_cache import SupabaseCache


def cache_with(handler) -> SupabaseCache:
    return SupabaseCache(
        url="https://db.example.test/",
        service_key="service",
        timeout=5,
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_get_filters_out_expired_rows_and_returns_the_expiry():
    seen: list[httpx.Request] = []
    expires = datetime.now(UTC) + timedelta(days=3)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[{"value": {"n": 1}, "expires_at": expires.isoformat()}])

    value, expires_at = await cache_with(handler).get("api_bible:x:JHN.3")

    assert value == {"n": 1}
    assert abs(expires_at - expires.timestamp()) < 1
    params = seen[0].url.params
    assert seen[0].url.path == "/rest/v1/scripture_cache"
    assert params["key"] == "eq.api_bible:x:JHN.3"
    assert params["expires_at"].startswith("gt.")
    assert seen[0].headers["authorization"] == "Bearer service"


@pytest.mark.asyncio
async def test_get_miss_is_none():
    assert await cache_with(lambda request: httpx.Response(200, json=[])).get("k") is None


@pytest.mark.asyncio
async def test_set_upserts_with_an_expiry_and_sweeps_once():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201 if request.method == "POST" else 204)

    cache = cache_with(handler)
    await cache.set("k", {"n": 1}, ttl=60)
    await cache.set("k2", {"n": 2}, ttl=60)

    posts = [r for r in seen if r.method == "POST"]
    deletes = [r for r in seen if r.method == "DELETE"]
    assert len(posts) == 2 and len(deletes) == 1  # swept at most hourly
    body = json.loads(posts[0].content)
    assert body["key"] == "k" and body["value"] == {"n": 1}
    assert "merge-duplicates" in posts[0].headers["prefer"]
    assert deletes[0].url.params["expires_at"].startswith("lt.")


@pytest.mark.asyncio
async def test_errors_raise_so_the_store_can_fall_back():
    cache = cache_with(lambda request: httpx.Response(500))
    with pytest.raises(httpx.HTTPStatusError):
        await cache.get("k")

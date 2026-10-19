"""The persistent tier of `app.cache.Store`, in Supabase's `scripture_cache`.

Talks to PostgREST directly over async httpx: the `supabase` client is
synchronous, and a blocking call here would stall every request in flight.
Uses the service-role key, because the table is closed to anon and
authenticated roles (see the migration).
"""

import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

TABLE = "scripture_cache"
#: Expired rows are swept at most this often per process.
SWEEP_INTERVAL = 60 * 60


def _iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


class SupabaseCache:
    def __init__(
        self,
        *,
        url: str,
        service_key: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"{url.rstrip('/')}/rest/v1",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            timeout=timeout,
            transport=transport,
        )
        self._last_sweep: float | None = None

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get(self, key: str) -> tuple[Any, float] | None:
        response = await self._client.get(
            f"/{TABLE}",
            params={
                "select": "value,expires_at",
                "key": f"eq.{key}",
                "expires_at": f"gt.{_iso(datetime.now(UTC))}",
                "limit": "1",
            },
        )
        response.raise_for_status()
        rows = response.json()
        if not rows:
            return None
        expires_at = datetime.fromisoformat(rows[0]["expires_at"]).timestamp()
        return rows[0]["value"], expires_at

    async def set(self, key: str, value: Any, ttl: float) -> None:
        now = datetime.now(UTC)
        response = await self._client.post(
            f"/{TABLE}",
            json={"key": key, "value": value, "expires_at": _iso(now + timedelta(seconds=ttl))},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        response.raise_for_status()
        await self._sweep(now)

    async def _sweep(self, now: datetime) -> None:
        """Delete expired rows, so text nobody re-reads is not kept past its
        refresh deadline either."""
        if self._last_sweep is not None and time.monotonic() - self._last_sweep < SWEEP_INTERVAL:
            return
        self._last_sweep = time.monotonic()
        response = await self._client.delete(
            f"/{TABLE}", params={"expires_at": f"lt.{_iso(now)}"}
        )
        response.raise_for_status()

"""The upstream HTTP clients this process holds open.

One per source, built at startup from whatever credentials are present and
closed together on shutdown. A source that needs a key is simply absent when
that key is missing, which is the same signal the catalogue uses to decide
what to offer — so "configured" is represented once, as the presence of a
client, rather than re-derived from settings at each call site.
"""

from dataclasses import dataclass

from .config import Settings
from .providers import ApiBibleClient, BibleApiClient, EsvClient, HelloAoClient


@dataclass(frozen=True)
class Clients:
    #: Keyless sources, always available.
    helloao: HelloAoClient
    bible_api: BibleApiClient
    #: Keyed sources, present only when their key is configured.
    api_bible: ApiBibleClient | None = None
    esv: EsvClient | None = None

    @classmethod
    def build(cls, settings: Settings) -> "Clients":
        timeout = settings.request_timeout
        return cls(
            helloao=HelloAoClient(timeout=timeout),
            bible_api=BibleApiClient(timeout=timeout),
            api_bible=(
                ApiBibleClient(
                    base_url=settings.api_bible_base_url,
                    api_key=settings.api_bible_key,
                    timeout=timeout,
                )
                if settings.api_bible_key
                else None
            ),
            esv=(
                EsvClient(api_key=settings.esv_api_key, timeout=timeout)
                if settings.esv_api_key
                else None
            ),
        )

    async def aclose(self) -> None:
        for client in (self.helloao, self.bible_api, self.api_bible, self.esv):
            if client is not None:
                await client.aclose()

"""The upstream HTTP clients this process holds open.

One per configured source, built at startup from the source registry and
closed together on shutdown. A source that needs a key is simply absent when
that key is missing, which is the same signal the catalogue uses to decide
what to offer — so "configured" is represented once, as the presence of a
client, rather than re-derived from settings at each call site.
"""

from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .providers import ApiBibleClient, HelloAoClient
from .sources import SOURCES, Source


@dataclass(frozen=True)
class Clients:
    by_source: dict[Source, Any] = field(default_factory=dict)

    @classmethod
    def build(cls, settings: Settings) -> "Clients":
        return cls(
            {
                name: spec.build_client(settings)
                for name, spec in SOURCES.items()
                if spec.configured(settings)
            }
        )

    def get(self, source: Source) -> Any | None:
        return self.by_source.get(source)

    # The two catalogues the app discovers translations from.
    @property
    def helloao(self) -> HelloAoClient:
        return self.by_source["helloao"]

    @property
    def api_bible(self) -> ApiBibleClient | None:
        return self.by_source.get("api_bible")

    async def aclose(self) -> None:
        for client in self.by_source.values():
            await client.aclose()

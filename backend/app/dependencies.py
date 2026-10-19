from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from .cache import Store
from .catalog import Catalog, Translation
from .clients import Clients
from .passages import Passages
from .providers import PassageProvider
from .sources import SOURCES


def get_catalog(request: Request) -> Catalog:
    return request.app.state.catalog


CatalogDep = Annotated[Catalog, Depends(get_catalog)]


async def get_translation(bible_id: str, catalog: CatalogDep) -> Translation:
    translation = await catalog.get(bible_id)
    if translation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown translation '{bible_id}'.",
        )
    return translation


TranslationDep = Annotated[Translation, Depends(get_translation)]


def get_clients(request: Request) -> Clients:
    return request.app.state.clients


ClientsDep = Annotated[Clients, Depends(get_clients)]

def get_store(request: Request) -> Store:
    return request.app.state.store


StoreDep = Annotated[Store, Depends(get_store)]


def get_provider(
    translation: TranslationDep, clients: ClientsDep, store: StoreDep
) -> PassageProvider:
    """Passages for this translation, from whichever source serves it."""
    spec = SOURCES[translation.source]
    client = clients.get(translation.source)
    if client is None:
        # A translation is only listed when its client exists, so this should
        # be unreachable — but say which upstream is missing if the catalogue
        # and the clients ever disagree.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{spec.label} is not configured on this server.",
        )
    return Passages(
        spec.open(client, translation.upstream_id, translation.new_testament_only),
        store,
        namespace=f"{translation.source}:{translation.upstream_id}",
        ttl=spec.cache_ttl,
    )


ProviderDep = Annotated[PassageProvider, Depends(get_provider)]

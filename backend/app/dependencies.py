from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException, Request, status

from .catalog import Catalog, Translation
from .clients import Clients
from .providers import (
    ApiBibleProvider,
    BibleApiProvider,
    EsvProvider,
    HelloAoProvider,
    PassageProvider,
)


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

_Client = TypeVar("_Client")


def _configured(client: _Client | None, source: str) -> _Client:
    """A translation is only listed when its client exists, so this should be
    unreachable — but say which upstream is missing rather than raise a
    KeyError if the catalogue and the clients ever disagree."""
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{source} is not configured on this server.",
        )
    return client


def get_provider(translation: TranslationDep, clients: ClientsDep) -> PassageProvider:
    """The client that can actually fetch this translation."""
    if translation.source == "api_bible":
        return ApiBibleProvider(
            _configured(clients.api_bible, "api.bible"), translation.upstream_id
        )
    if translation.source == "esv":
        return EsvProvider(_configured(clients.esv, "The ESV API"))
    if translation.source == "helloao":
        return HelloAoProvider(clients.helloao, translation.upstream_id)
    return BibleApiProvider(
        clients.bible_api,
        translation.upstream_id,
        new_testament_only=translation.new_testament_only,
    )


ProviderDep = Annotated[PassageProvider, Depends(get_provider)]

"""Anonymous and user-scoped Supabase clients."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from supabase import Client, ClientOptions, create_client

from ..config import Settings, get_settings


def create_anon_client(settings: Settings | None = None) -> Client:
    settings = settings or get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account storage is not configured.",
        )
    # No in-memory session: set_session on a shared client would race.
    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        options=ClientOptions(auto_refresh_token=False, persist_session=False),
    )


def create_user_client(access_token: str, settings: Settings | None = None) -> Client:
    client = create_anon_client(settings)
    client.postgrest.auth(access_token)
    return client


def get_anon_client() -> Client:
    return create_anon_client()


AnonClientDep = Annotated[Client, Depends(get_anon_client)]

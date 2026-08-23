"""Supabase client factory and per-user row stores."""

from typing import Any

from .client import AnonClientDep, create_anon_client, create_user_client, get_anon_client

__all__ = [
    "AnonClientDep",
    "UserOwnedStore",
    "create_anon_client",
    "create_user_client",
    "get_anon_client",
    "get_designs_store",
    "get_files_store",
    "get_user_client",
]


def __getattr__(name: str) -> Any:
    if name in {"UserOwnedStore", "get_designs_store", "get_files_store", "get_user_client"}:
        from . import store

        return getattr(store, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

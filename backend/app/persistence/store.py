"""Generic CRUD for tables keyed by user_id."""

from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from supabase import Client

from ..account import AuthUserDep
from .client import create_user_client

_PROTECTED = frozenset({"id", "user_id"})


class UserOwnedStore:
    """CRUD for a table whose rows belong to `user_id`."""

    def __init__(self, client: Client, user_id: str, table: str) -> None:
        self._client = client
        self._user_id = user_id
        self._table = table

    def list(self) -> list[dict[str, Any]]:
        result = (
            self._client.table(self._table)
            .select("*")
            .eq("user_id", self._user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        return list(result.data or [])

    def get(self, row_id: str) -> dict[str, Any]:
        result = (
            self._client.table(self._table)
            .select("*")
            .eq("id", row_id)
            .eq("user_id", self._user_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
        return rows[0]

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        # RLS policies key off auth.uid(); the column must match the JWT.
        row = {key: value for key, value in payload.items() if key not in _PROTECTED}
        row["user_id"] = self._user_id
        result = self._client.table(self._table).insert(row).execute()
        rows = result.data or []
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not save.",
            )
        return rows[0]

    def update(self, row_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        patch = {key: value for key, value in payload.items() if key not in _PROTECTED}
        if not patch:
            return self.get(row_id)
        result = (
            self._client.table(self._table)
            .update(patch)
            .eq("id", row_id)
            .eq("user_id", self._user_id)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
        return rows[0]

    def delete(self, row_id: str) -> None:
        result = (
            self._client.table(self._table)
            .delete()
            .eq("id", row_id)
            .eq("user_id", self._user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")


def get_user_client(user: AuthUserDep) -> Client:
    return create_user_client(user.access_token)


UserClientDep = Annotated[Client, Depends(get_user_client)]


def get_designs_store(user: AuthUserDep, client: UserClientDep) -> UserOwnedStore:
    return UserOwnedStore(client, user.id, "designs")


def get_files_store(user: AuthUserDep, client: UserClientDep) -> UserOwnedStore:
    return UserOwnedStore(client, user.id, "journal_files")


DesignsStoreDep = Annotated[UserOwnedStore, Depends(get_designs_store)]
FilesStoreDep = Annotated[UserOwnedStore, Depends(get_files_store)]

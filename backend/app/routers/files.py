"""Saved journal snapshots (passage plus design)."""

from uuid import UUID

from fastapi import APIRouter, status

from ..account import AuthUserDep
from ..account_schemas import JournalFile, JournalFileCreate, JournalFilePatch
from ..persistence.store import FilesStoreDep

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("")
def list_files(_user: AuthUserDep, store: FilesStoreDep) -> list[JournalFile]:
    return [JournalFile.model_validate(row) for row in store.list()]


@router.get("/{file_id}")
def get_file(file_id: UUID, _user: AuthUserDep, store: FilesStoreDep) -> JournalFile:
    return JournalFile.model_validate(store.get(str(file_id)))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_file(
    body: JournalFileCreate, _user: AuthUserDep, store: FilesStoreDep
) -> JournalFile:
    return JournalFile.model_validate(store.create(body.model_dump()))


@router.patch("/{file_id}")
def update_file(
    file_id: UUID,
    body: JournalFilePatch,
    _user: AuthUserDep,
    store: FilesStoreDep,
) -> JournalFile:
    return JournalFile.model_validate(
        store.update(str(file_id), body.model_dump(exclude_unset=True, exclude_none=True))
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(file_id: UUID, _user: AuthUserDep, store: FilesStoreDep) -> None:
    store.delete(str(file_id))

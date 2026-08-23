"""Saved page-layout presets."""

from uuid import UUID

from fastapi import APIRouter, status

from ..account import AuthUserDep
from ..account_schemas import DesignCreate, DesignPatch, DesignRecord
from ..persistence.store import DesignsStoreDep

router = APIRouter(prefix="/api/designs", tags=["designs"])


@router.get("")
def list_designs(_user: AuthUserDep, store: DesignsStoreDep) -> list[DesignRecord]:
    return [DesignRecord.model_validate(row) for row in store.list()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_design(
    body: DesignCreate, _user: AuthUserDep, store: DesignsStoreDep
) -> DesignRecord:
    return DesignRecord.model_validate(store.create(body.model_dump()))


@router.patch("/{design_id}")
def update_design(
    design_id: UUID,
    body: DesignPatch,
    _user: AuthUserDep,
    store: DesignsStoreDep,
) -> DesignRecord:
    return DesignRecord.model_validate(
        store.update(str(design_id), body.model_dump(exclude_unset=True, exclude_none=True))
    )


@router.delete("/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_design(design_id: UUID, _user: AuthUserDep, store: DesignsStoreDep) -> None:
    store.delete(str(design_id))

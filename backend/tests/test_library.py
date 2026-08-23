"""Designs and journal files: auth gates and CRUD against a fake store.

The app is built without a lifespan. get_current_user and the row stores are
fakes, so no Supabase client is constructed.
"""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from app.account import AuthUser, get_current_user
from app.persistence.client import get_anon_client
from app.persistence.store import get_designs_store, get_files_store
from app.routers import designs, files

SETTINGS = {
    "pageSize": "A4",
    "orientation": "portrait",
    "layout": "right",
    "parallelMode": "columns",
    "lines": "ruled",
    "font": "serif",
    "size": 12,
    "lead": 1.6,
    "numbers": "sup",
    "flow": "para",
    "poetryIndent": "regular",
    "wordsOfChrist": True,
    "pageNumbers": True,
    "paper": "Ivory",
    "justify": True,
    "showHeadings": True,
    "showChapterNumbers": True,
    "parallelSwap": False,
    "titleLine": False,
    "textShare": 0.57,
}


class _ForbiddenClient:
    """Any use means a test reached the real persistence layer."""

    def __getattr__(self, name: str) -> None:
        raise AssertionError(f"tests must not construct a Supabase client ({name})")


class FakeStore:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def list(self) -> list[dict]:
        return sorted(self.rows.values(), key=lambda row: row["updated_at"], reverse=True)

    def get(self, row_id: str) -> dict:
        if row_id not in self.rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
        return self.rows[row_id]

    def create(self, payload: dict) -> dict:
        now = datetime.now(UTC).isoformat()
        row = {
            **payload,
            "id": str(uuid4()),
            "user_id": "user-1",
            "created_at": now,
            "updated_at": now,
        }
        self.rows[row["id"]] = row
        return row

    def update(self, row_id: str, payload: dict) -> dict:
        if row_id not in self.rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
        now = datetime.now(UTC).isoformat()
        self.rows[row_id] = {**self.rows[row_id], **payload, "updated_at": now}
        return self.rows[row_id]

    def delete(self, row_id: str) -> None:
        if row_id not in self.rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
        del self.rows[row_id]


def _anon_app() -> TestClient:
    app = FastAPI()
    app.include_router(designs.router)
    app.include_router(files.router)
    app.dependency_overrides[get_anon_client] = lambda: _ForbiddenClient()
    return TestClient(app)


def _authed_app() -> tuple[TestClient, FakeStore, FakeStore]:
    designs_store = FakeStore()
    files_store = FakeStore()
    app = FastAPI()
    app.include_router(designs.router)
    app.include_router(files.router)
    app.dependency_overrides[get_anon_client] = lambda: _ForbiddenClient()
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id="user-1", email="ada@example.com"
    )
    app.dependency_overrides[get_designs_store] = lambda: designs_store
    app.dependency_overrides[get_files_store] = lambda: files_store
    return TestClient(app), designs_store, files_store


def test_designs_and_files_require_auth():
    client = _anon_app()
    assert client.get("/api/designs").status_code == 401
    assert client.post("/api/designs", json={"name": "A", "settings": SETTINGS}).status_code == 401
    assert client.get("/api/files").status_code == 401
    assert client.get("/api/files/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").status_code == 401


def test_create_list_delete_design():
    client, store, _ = _authed_app()
    created = client.post("/api/designs", json={"name": "  Quiet  ", "settings": SETTINGS})
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Quiet"
    assert body["settings"]["pageSize"] == "A4"
    assert "user_id" not in body

    listed = client.get("/api/designs")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [body["id"]]

    deleted = client.delete(f"/api/designs/{body['id']}")
    assert deleted.status_code == 204
    assert store.rows == {}
    assert client.delete(f"/api/designs/{body['id']}").status_code == 404


def test_create_get_delete_file():
    client, _, store = _authed_app()
    created = client.post(
        "/api/files",
        json={
            "name": "John 3",
            "book_id": "JHN",
            "start_chapter": "3",
            "start_verse": "16",
            "end_chapter": "3",
            "end_verse": "17",
            "design": SETTINGS,
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["book_id"] == "JHN"
    assert body["design"]["layout"] == "right"

    fetched = client.get(f"/api/files/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]

    deleted = client.delete(f"/api/files/{body['id']}")
    assert deleted.status_code == 204
    assert store.rows == {}
    assert client.get(f"/api/files/{body['id']}").status_code == 404


def test_invalid_book_id_is_rejected():
    client, _, store = _authed_app()
    response = client.post(
        "/api/files",
        json={
            "name": "John 3",
            "book_id": "John",
            "start_chapter": "3",
            "start_verse": "16",
            "end_chapter": "3",
            "end_verse": "17",
            "design": SETTINGS,
        },
    )
    assert response.status_code == 422
    assert store.rows == {}

"""Health is the warmup target: Next rewrites /api/:path*, not /health."""

from fastapi.testclient import TestClient

from app.main import app


def test_api_health_is_ok():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_alias_is_ok():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

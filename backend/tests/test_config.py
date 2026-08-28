"""SINGLE_USER is honored locally and forced off on Vercel prod/preview."""

import logging

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_local_single_user_true_is_honored(monkeypatch):
    monkeypatch.setenv("SINGLE_USER", "true")
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert get_settings().single_user is True


def test_local_single_user_false_stays_false(monkeypatch):
    monkeypatch.setenv("SINGLE_USER", "false")
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    assert get_settings().single_user is False


def test_vercel_production_forces_single_user_false(monkeypatch):
    monkeypatch.setenv("SINGLE_USER", "true")
    monkeypatch.setenv("VERCEL_ENV", "production")
    assert get_settings().single_user is False


def test_vercel_preview_forces_single_user_false(monkeypatch):
    monkeypatch.setenv("SINGLE_USER", "true")
    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert get_settings().single_user is False


def test_vercel_dev_honors_single_user(monkeypatch):
    """`vercel dev` sets VERCEL=1 and VERCEL_ENV=development — treat as local."""
    monkeypatch.setenv("SINGLE_USER", "true")
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "development")
    assert get_settings().single_user is True


def test_vercel_production_warns_when_overriding(monkeypatch, caplog):
    monkeypatch.setenv("SINGLE_USER", "true")
    monkeypatch.setenv("VERCEL_ENV", "production")
    with caplog.at_level(logging.WARNING, logger="app.config"):
        get_settings()
    assert any("SINGLE_USER" in record.message for record in caplog.records)

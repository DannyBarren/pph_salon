"""Settings parsing + production-safety regression tests.

``CORS_ORIGINS`` / ``ALLOWED_HOSTS`` arrive as plain strings from process env
or a ``.env`` file. pydantic-settings used to json.loads() those list-typed
fields before validators ran, which crashed the boot on a perfectly normal
value like ``https://app.vercel.app`` — the exact form the deploy guide tells
operators to set. These tests pin the accepted input forms and the production
safety guards.
"""

from __future__ import annotations

import pytest
from app.core.config import INSECURE_SECRET, Settings


def test_cors_origins_single_plain_string(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://pph.vercel.app")
    assert Settings().cors_origins == ["https://pph.vercel.app"]


def test_cors_origins_comma_separated(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.vercel.app, https://b.vercel.app")
    assert Settings().cors_origins == ["https://a.vercel.app", "https://b.vercel.app"]


def test_cors_origins_json_list(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CORS_ORIGINS", '["https://a.vercel.app", "https://b.vercel.app"]')
    assert Settings().cors_origins == ["https://a.vercel.app", "https://b.vercel.app"]


def test_allowed_hosts_plain_string(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ALLOWED_HOSTS", "pph-api.up.railway.app")
    assert Settings().allowed_hosts == ["pph-api.up.railway.app"]


def test_production_rejects_insecure_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", INSECURE_SECRET)
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings()


def test_production_rejects_short_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "too-short")
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings()


def test_production_forces_demo_mode_off(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "x" * 48)
    monkeypatch.setenv("DEMO_MODE", "true")
    assert Settings().demo_mode is False

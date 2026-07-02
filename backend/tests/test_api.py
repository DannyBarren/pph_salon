"""Smoke tests for the API endpoints."""

from __future__ import annotations

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_root_and_health():
    assert client.get("/").status_code == 200
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_effective_rate_endpoint():
    r = client.post(
        "/api/v1/payplan/effective-rate",
        json={"production": 1000, "hours": 8, "salon_id": "s1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pay"] == 420.0
    assert body["on_guarantee"] is False


def test_what_if_endpoint():
    r = client.post(
        "/api/v1/payplan/what-if",
        json={
            "target_rate": 32,
            "scheduled_hours": 80,
            "production_to_date": 5000,
            "remaining_days": 3,
            "salon_id": "s1",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["required_production"] > 0
    assert body["remaining_production"] >= 0

"""Tests for the global payment-logic API (highest-admin only)."""

from __future__ import annotations

import pytest
from app.db.session import get_session
from app.main import app
from app.models import User, UserRole
from app.services import pay_engine
from app.services import payment_logic as pl
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

PP = "/api/v1"


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def client(engine):
    def _get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_seeds_defaults_with_formula(client):
    r = client.get(f"{PP}/payment-logic")
    assert r.status_code == 200, r.text
    body = r.json()
    # Seeded from pay_engine defaults (client's OtherData tier table).
    assert len(body["tiers"]) == len(pay_engine.DEFAULT_PPH_TIERS)
    assert body["tiers"][0] == {"pay_rate": 8.0, "pph_required": 20.0}
    assert body["tiers"][-1] == {"pay_rate": 20.0, "pph_required": 50.0}
    assert body["np_rate"] == pay_engine.DEFAULT_NP_RATE
    assert body["guarantee_rate"] == 10.0
    assert body["haircut_price"] == pay_engine.DEFAULT_HAIRCUT_PRICE
    assert body["color_price"] == pay_engine.DEFAULT_COLOR_PRICE
    # A plain-language breakdown is included.
    assert body["formula"]["parameters"]["tier_count"] == 13
    assert body["formula"]["definitions"]


def test_update_applies_globally_and_audits(client):
    new_logic = {
        "tiers": [
            {"pay_rate": 15, "pph_required": 30},
            {"pay_rate": 20, "pph_required": 45},
            {"pay_rate": 25, "pph_required": 60},
        ],
        "np_rate": 0.5,
        "np_percent": 0.2,
        "guarantee_rate": 15,
        "commission_rate": 0.5,
        "haircut_price": 30,
        "color_price": 100,
        "avg_ticket_haircut": 30,
        "avg_ticket_color": 100,
        "service_mix_haircut": 0.5,
        "min_services_per_day": 5,
    }
    r = client.put(f"{PP}/payment-logic", json=new_logic)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["guarantee_rate"] == 15
    assert len(body["tiers"]) == 3

    # Persisted: a subsequent GET reflects the change (single source of truth).
    got = client.get(f"{PP}/payment-logic").json()
    assert got["np_rate"] == 0.5
    assert got["tiers"][-1] == {"pay_rate": 25.0, "pph_required": 60.0}

    # Audit trail records the change.
    actions = [e["action"] for e in client.get(f"{PP}/admin/audit").json()]
    assert "payment_logic.update" in actions


def test_update_rejects_duplicate_and_non_monotonic_tiers(client):
    dup = {
        "tiers": [{"pay_rate": 15, "pph_required": 30}, {"pay_rate": 15, "pph_required": 40}],
        "np_rate": 0.4, "np_percent": 0.195, "guarantee_rate": 12, "commission_rate": 0.4,
        "haircut_price": 23, "color_price": 85, "avg_ticket_haircut": 23,
        "avg_ticket_color": 85, "service_mix_haircut": 0.6, "min_services_per_day": 6,
    }
    assert client.put(f"{PP}/payment-logic", json=dup).status_code == 422

    non_monotonic = {**dup, "tiers": [
        {"pay_rate": 15, "pph_required": 40}, {"pay_rate": 20, "pph_required": 30}]}
    assert client.put(f"{PP}/payment-logic", json=non_monotonic).status_code == 422


def test_preview_uses_proposed_config_without_saving(client):
    # Seed defaults first.
    client.get(f"{PP}/payment-logic")

    req = {
        "config": {
            "tiers": [{"pay_rate": 15, "pph_required": 30}, {"pay_rate": 20, "pph_required": 50}],
            "np_rate": 0.4, "np_percent": 0.195, "guarantee_rate": 15, "commission_rate": 0.4,
            "haircut_price": 23, "color_price": 85, "avg_ticket_haircut": 23,
            "avg_ticket_color": 85, "service_mix_haircut": 0.6, "min_services_per_day": 6,
        },
        "production": 500,
        "hours": 10,
        "target_rate": 20,
        "scheduled_hours": 40,
    }
    r = client.post(f"{PP}/payment-logic/preview", json=req)
    assert r.status_code == 200, r.text
    body = r.json()
    # PPH = 500/10 = 50 -> exactly reaches tier 20.
    assert body["pph"] == 50.0
    assert body["effective_rate"] == 20.0
    assert body["required_production_for_target"] == pytest.approx(50 * 40)

    # Preview did NOT persist: stored config is still the defaults.
    got = client.get(f"{PP}/payment-logic").json()
    assert len(got["tiers"]) == 13


def test_role_guard_blocks_non_highest_admin(engine):
    """A stylist / manager principal is rejected (real, non-demo auth path)."""
    # Insert a stylist and act as them via the demo user-id header.
    with Session(engine) as s:
        from app.models import Salon
        salon = Salon(name="Aria")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        stylist = User(name="Reb", role=UserRole.stylist, salon_id=salon.id)
        s.add(stylist)
        s.commit()
        s.refresh(stylist)
        stylist_id = stylist.id

    def _get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    try:
        c = TestClient(app)
        r = c.get(f"{PP}/payment-logic", headers={"X-Demo-User-Id": str(stylist_id)})
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_engine_from_config_matches_default():
    """The engine factory reproduces the workbook tiers from a config object."""
    values = pl.default_config_values()

    class _Cfg:
        pass

    cfg = _Cfg()
    for k, v in values.items():
        setattr(cfg, k, v)
    eng = pay_engine.PayPlanEngine.from_config(cfg)
    assert eng.pph_for_rate(16) == 40
    assert eng.get_effective_rate(40) == 16
    # Per-salon overrides are disabled — load_tiers ignores its argument.
    assert eng.load_tiers(999) == eng.tiers

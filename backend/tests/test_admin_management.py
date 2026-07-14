"""Tests for super-admin management: salons, users, bulk import, daily, audit."""

from __future__ import annotations

import io

import pytest
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole
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


def _seed_salon(engine, name="Aria Studio") -> int:
    with Session(engine) as s:
        salon = Salon(name=name)
        s.add(salon)
        s.commit()
        s.refresh(salon)
        return salon.id


def test_create_and_list_salon(client):
    r = client.post(f"{PP}/salons", json={"name": "Lumiere", "city": "Denver"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Lumiere"
    assert body["service_prices"]["haircut"] == 23.0

    dup = client.post(f"{PP}/salons", json={"name": "Lumiere"})
    assert dup.status_code == 409

    lst = client.get(f"{PP}/salons")
    assert any(s["name"] == "Lumiere" for s in lst.json())


def test_pay_tier_config(client):
    salon_id = client.post(f"{PP}/salons", json={"name": "Maven"}).json()["id"]
    tiers = [
        {"salon_id": salon_id, "desired_rate": 20, "pph": 50},
        {"salon_id": salon_id, "desired_rate": 25, "pph": 62.5},
    ]
    r = client.put(f"{PP}/salons/{salon_id}/pay-tiers", json=tiers)
    assert r.status_code == 200
    assert len(r.json()) == 2
    got = client.get(f"{PP}/salons/{salon_id}/pay-tiers").json()
    assert [t["desired_rate"] for t in got] == [20, 25]


def test_single_user_create_returns_temp_password_flow(client, engine):
    salon_id = _seed_salon(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "Rebeca", "role": "stylist", "salon_id": salon_id, "email": "rebeca@x.com"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "rebeca@x.com"


def test_bulk_user_import(client, engine):
    salon_id = _seed_salon(engine, "Aria Studio")
    csv_text = (
        "email,name,role,salon_id,salon_name,manager_email,title\n"
        "gm@aria.com,Jordan,manager,,Aria Studio,,GM\n"
        "reb@aria.com,Rebeca,stylist,,Aria Studio,gm@aria.com,Stylist\n"
        f"steph@aria.com,Steph,stylist,{salon_id},,,Stylist\n"
        f"bad@aria.com,,stylist,{salon_id},,,Stylist\n"
    )
    files = {"file": ("users.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-users", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 3
    assert body["skipped"] == 1  # the row with no name
    assert "reb@aria.com" in body["credentials"]

    # manager_email resolved to a real manager id
    with Session(engine) as s:
        reb = s.exec(
            __import__("sqlmodel").select(User).where(User.email == "reb@aria.com")
        ).first()
        gm = s.exec(
            __import__("sqlmodel").select(User).where(User.email == "gm@aria.com")
        ).first()
        assert reb.manager_id == gm.id


def test_daily_import_aggregates_week(client, engine):
    salon_id = _seed_salon(engine)
    with Session(engine) as s:
        u = User(name="Reb", role=UserRole.stylist, salon_id=salon_id)
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id
    csv_text = (
        "user_id,date,scheduled_hrs,actual_hrs,actual_haircuts,actual_colors,actual_other_value\n"
        f"{uid},2026-06-30,8,7.5,5,2,10\n"
        f"{uid},2026-07-01,8,8,6,3,0\n"
    )
    files = {"file": ("daily.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-daily", files=files)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 2

    from app.models import Week
    with Session(engine) as s:
        week = s.exec(__import__("sqlmodel").select(Week).where(Week.stylist_id == uid)).first()
        assert week is not None
        assert week.scheduled_total_hrs == 16
        assert week.actual_haircuts == 11
        # production = 11*23 + 5*85 + 10 = 253 + 425 + 10 = 688
        assert week.actual_production == pytest.approx(688.0)


def test_zenoti_source_normalization(client, engine):
    salon_id = _seed_salon(engine)
    with Session(engine) as s:
        u = User(name="Reb", role=UserRole.stylist, salon_id=salon_id)
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id
    csv_text = (
        "Employee Id,Center Name,Week Start,Scheduled Hours,Worked Hours,Haircuts,Colors\n"
        f"{uid},Aria Studio,2026-06-29,28,27,18,9\n"
    )
    files = {"file": ("zenoti.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-weekly?source=zenoti", files=files)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 1


def test_audit_log_records_actions(client):
    client.post(f"{PP}/salons", json={"name": "Audited Salon"})
    r = client.get(f"{PP}/admin/audit")
    assert r.status_code == 200
    actions = [e["action"] for e in r.json()]
    assert "salon.create" in actions


def test_security_headers_present(client):
    r = client.get(f"{PP}/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" in r.headers
    assert r.headers.get("X-Request-ID")


def test_readiness_probe(client):
    r = client.get(f"{PP}/health/ready")
    assert r.status_code == 200
    assert r.json()["database"]["ok"] is True

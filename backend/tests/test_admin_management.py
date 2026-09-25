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
        json={
            "name": "Rebeca",
            "role": "stylist",
            "salon_id": salon_id,
            "email": "rebeca@x.com",
            "employee_code": "VG1501",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "rebeca@x.com"


def test_bulk_user_import(client, engine):
    salon_id = _seed_salon(engine, "Aria Studio")
    csv_text = (
        "email,name,role,salon_id,salon_name,manager_email,title,employee_code\n"
        "gm@aria.com,Jordan,manager,,Aria Studio,,GM,VG1406\n"
        "reb@aria.com,Rebeca,stylist,,Aria Studio,gm@aria.com,Stylist,VG1501\n"
        f"steph@aria.com,Steph,stylist,{salon_id},,,Stylist,VG1502\n"
        f"bad@aria.com,,stylist,{salon_id},,,Stylist,VG1503\n"
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


def test_daily_import_client_app_format(client, engine):
    """The client's 'Data provided to App' daily format: Act Svc Rev($) is the
    authoritative day production; EEID resolves by employee code; Excl? syncs the
    excluded flag; blank/no-activity rows are tolerated."""
    from sqlmodel import select

    with Session(engine) as s:
        salon = Salon(name="Burleson, TX", location="11016-Burleson,TX-SSF")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        u = User(name="Holliean Miller", role=UserRole.stylist, salon_id=salon.id,
                 employee_code="VG1426")
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id

    # The salon code contains a comma, so it is quoted (as real exports do).
    csv_text = (
        "Salon,EEID,EE Name,Excl?,Date,Sched Hrs,Actual Hrs,Act Svc Rev($),Act Cuts Count,Act Colors Count\n"
        '"11016-Burleson,TX-SSF",VG1426,Holliean Miller,N,2026-07-20,5,4.03,56.7,3,0\n'
        '"11016-Burleson,TX-SSF",VG1426,Holliean Miller,N,2026-07-21,0,,,,\n'  # no-activity day
        '"11016-Burleson,TX-SSF",VG1426,Holliean Miller,N,2026-07-22,5,6.13,70,2,0\n'
        ",,,,,,,,,\n"  # fully blank row — skipped silently
    )
    files = {"file": ("daily.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-daily", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["inserted"] == 3  # 3 dated rows; blank row skipped, not counted

    from app.models import Week
    with Session(engine) as s:
        week = s.exec(select(Week).where(Week.stylist_id == uid)).first()
        assert week is not None
        # Production is the sum of Act Svc Rev($) (authoritative), NOT counts×price.
        assert week.actual_production == pytest.approx(56.7 + 70.0)
        assert week.actual_haircuts == 5  # 3 + 2
        assert (week.actual_colors or 0) == 0  # zero total is stored as None
        assert week.scheduled_total_hrs == pytest.approx(10.0)  # 5 + 0 + 5


def test_daily_import_syncs_excluded_flag(client, engine):
    with Session(engine) as s:
        salon = Salon(name="Sherman", location="11020-Sherman,TX-SSF")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        u = User(name="Team Lead", role=UserRole.manager, salon_id=salon.id, employee_code="VG1406")
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id

    csv_text = (
        "Salon,EEID,EE Name,Excl?,Date,Sched Hrs,Actual Hrs,Act Svc Rev($),Act Cuts Count,Act Colors Count\n"
        '"11020-Sherman,TX-SSF",VG1406,Team Lead,Y,2026-07-20,8,8,0,0,0\n'
    )
    files = {"file": ("daily.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    assert client.post(f"{PP}/admin/import-daily", files=files).status_code == 200

    with Session(engine) as s:
        lead = s.get(User, uid)
        assert lead.excluded is True


def test_daily_template_matches_client_columns(client):
    import csv

    text = client.get(f"{PP}/admin/import-daily-template").text
    header = next(csv.reader(io.StringIO(text)))
    assert header == [
        "employee_id",
        "salon_name",
        "week_start\nsale_date",
        "scheduled_hrs",
        "actual_hrs",
        "actual_haircuts",
        "actual_colors",
        "actual_other_value\nservice_revenue",
        "notes",
        "Employee Name",
        "pay_period",
        "Include/Exclude",
    ]
    # Must not be the old weekly-only column set.
    assert header != [
        "employee_id", "salon_name", "week_start", "scheduled_hrs", "actual_hrs",
        "actual_haircuts", "actual_colors", "actual_other_value", "notes",
    ]


def test_daily_import_v2_client_format(client, engine):
    """The client v2 daily export: hyphenated employee_id (VG-1426), a
    week_start/sale_date column, US M/D/YYYY dates, service_revenue as the
    authoritative production, and Include/Exclude driving the excluded flag."""
    from sqlmodel import select

    with Session(engine) as s:
        salon = Salon(name="Burleson, TX", location="11016-Burleson,TX-SSF")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        # Roster stores the code WITHOUT the hyphen; the file sends VG-1426.
        u = User(name="Holliean Miller", role=UserRole.stylist, salon_id=salon.id,
                 employee_code="VG1426", excluded=False)
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id

    # Note the two-names-in-one-cell headers (newline) and US date format.
    csv_text = (
        'employee_id,salon_name,"week_start\nsale_date",scheduled_hrs,actual_hrs,'
        'actual_haircuts,actual_colors,"actual_other_value\nservice_revenue",'
        "Employee Name,pay_period,Include/Exclude\n"
        "VG-1426,\"Burleson,TX\",6/22/2026,5,4.52,3,0,113,Holliean Miller,06-22-2026 to 07-05-2026,Exclude\n"
        "VG-1426,\"Burleson,TX\",6/27/2026,6,5.38,7,0,167.7,Holliean Miller,06-22-2026 to 07-05-2026,Exclude\n"
    )
    files = {"file": ("v2daily.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-daily", files=files)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 2

    from app.models import DailyPerformance, Week
    with Session(engine) as s:
        week = s.exec(select(Week).where(Week.stylist_id == uid)).first()
        assert week is not None
        assert week.week_start.isoformat() == "2026-06-22"
        # Authoritative daily service revenue summed for the week.
        assert week.actual_production == pytest.approx(113 + 167.7)
        assert week.actual_haircuts == 10  # 3 + 7
        days = s.exec(select(DailyPerformance).where(DailyPerformance.week_id == week.id)).all()
        assert {d.date.isoformat() for d in days} == {"2026-06-22", "2026-06-27"}
        # Include/Exclude = Exclude → excluded True.
        assert s.get(User, uid).excluded is True


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

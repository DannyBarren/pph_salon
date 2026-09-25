"""Tests for the real client / SSF combined export importer.

Exercises the money parser, header auto-detection, the combined provisioning
pipeline, and a full import of the actual client CSV committed to the repo
(``PPH Data 06-26-2026.xlsx.csv``) to prove every row lands cleanly.
"""

from __future__ import annotations

import csv
import io
from datetime import date
from pathlib import Path

import pytest
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole, Week
from app.services.importers import (
    _looks_like_client_export,
    import_client_export,
    normalize_weekly_rows,
    parse_money,
)
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

PP = "/api/v1"
CLIENT_CSV = Path(__file__).resolve().parents[2] / "PPH Data 06-26-2026.xlsx.csv"
WEEK_START = date(2026, 6, 22)  # Monday of the file's week (06-26-2026 is a Fri)


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def session(engine):
    with Session(engine) as s:
        yield s


@pytest.fixture()
def client(engine):
    def _get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def _parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip(): v for k, v in row.items()} for row in reader]


# ── Money parsing ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("_($* 2418.15_)", 2418.15),
        ("_($* 359.10_)", 359.10),
        ("$1,234.56", 1234.56),
        ("$113.00", 113.00),
        ("2732.10", 2732.10),
        (2732.1, 2732.1),
        ("", None),
        (None, None),
        ("  ", None),
    ],
)
def test_parse_money(raw, expected):
    assert parse_money(raw) == expected


# ── Header detection + normalization ─────────────────────────────────────────

def test_detects_and_normalizes_client_export():
    rows = _parse_csv(
        "Salon,Salon Name,Employee code,Employee Name,Position,Guaranteed Pay-Rate,"
        "Scheduled hours,Hours worked,Net service Rev,Avg Haircut,Avg Color\n"
        '"11016-Burleson,TX-SSF","Burleson, TX",VG1116,LINDA JONES,Manager,12,61,62.92,'
        '"_($* 2418.15_)",23,85\n'
    )
    assert _looks_like_client_export(rows) is True
    # Auto-detected even without an explicit source.
    normalized = normalize_weekly_rows(rows, "native")
    assert normalized[0]["employee_code"] == "VG1116"
    assert normalized[0]["name"] == "LINDA JONES"
    assert normalized[0]["actual_other_value"] == pytest.approx(2418.15)


# ── Combined import pipeline (small inline sample) ────────────────────────────

def test_import_client_export_creates_salons_users_weeks(session: Session):
    rows = _parse_csv(
        "Salon,Salon Name,Employee code,Employee Name,Position,Guaranteed Pay-Rate,"
        "Scheduled hours,Hours worked,Net service Rev,Avg Haircut,Avg Color\n"
        '"11016-Burleson,TX-SSF","Burleson, TX",VG1116,LINDA JONES,Manager,12,61,62.92,"_($* 2418.15_)",23,85\n'
        '"11016-Burleson,TX-SSF","Burleson, TX",VG1296,Mariah Perez,Stylist,9,16,15.58,"_($* 359.10_)",23,85\n'
        '"11020-Sherman,TX-SSF","Sherman,TX",VG1406,Louis Davis,Manager,17,53,61.45,"_($* 1520.15_)",23,85\n'
    )
    result = import_client_export(session, rows, week_start=WEEK_START)
    assert result.errors == []
    assert result.salons_created == 2
    assert result.users_created == 3
    assert result.weeks_inserted == 3

    # Per-employee guarantee + role mapping.
    linda = session.exec(select(User).where(User.employee_code == "VG1116")).first()
    assert linda.role == UserRole.manager
    assert linda.guarantee_rate == 12
    mariah = session.exec(select(User).where(User.employee_code == "VG1296")).first()
    assert mariah.role == UserRole.stylist
    # Stylist auto-linked to the salon manager.
    assert mariah.manager_id == linda.id

    # Net service Rev stored as the week's production (no haircut/color counts).
    week = session.exec(select(Week).where(Week.stylist_id == linda.id)).first()
    assert week.week_start == WEEK_START
    assert week.actual_production == pytest.approx(2418.15)
    assert week.actual_other_value == pytest.approx(2418.15)
    assert week.scheduled_total_hrs == 61
    assert week.actual_total_hrs == pytest.approx(62.92)

    # Salon service prices come from Avg Haircut / Avg Color.
    salon = session.get(Salon, linda.salon_id)
    assert salon.service_prices["haircut"] == 23
    assert salon.service_prices["color"] == 85


def test_import_client_export_is_idempotent(session: Session):
    rows = _parse_csv(
        "Salon,Salon Name,Employee code,Employee Name,Position,Guaranteed Pay-Rate,"
        "Scheduled hours,Hours worked,Net service Rev,Avg Haircut,Avg Color\n"
        '"11016-Burleson,TX-SSF","Burleson, TX",VG1116,LINDA JONES,Manager,12,61,62.92,"_($* 2418.15_)",23,85\n'
    )
    first = import_client_export(session, rows, week_start=WEEK_START)
    assert first.users_created == 1 and first.weeks_inserted == 1
    second = import_client_export(session, rows, week_start=WEEK_START)
    assert second.users_created == 0
    assert second.users_updated == 1
    assert second.weeks_updated == 1
    # No duplicate salons or users.
    assert len(session.exec(select(Salon)).all()) == 1
    assert len(session.exec(select(User)).all()) == 1


def test_same_employee_code_across_salons_is_two_users(session: Session):
    # VG1429 (Michelle Moore) legitimately appears in two different salons.
    rows = _parse_csv(
        "Salon,Salon Name,Employee code,Employee Name,Position,Guaranteed Pay-Rate,"
        "Scheduled hours,Hours worked,Net service Rev,Avg Haircut,Avg Color\n"
        "11931-Casper Cy Ave. WY-SSF,\"Casper Cy Ave,WY\",VG1429,Michelle Moore,Stylist,11,8,8.1,\"_($* 253.70_)\",23,85\n"
        '"11932-Casper, 2nd St., WY-SSF","Casper 2nd St,WY",VG1429,Michelle Moore,Stylist,11,22,13.82,"_($* 426.80_)",23,85\n'
    )
    result = import_client_export(session, rows, week_start=WEEK_START)
    assert result.salons_created == 2
    assert result.users_created == 2
    users = session.exec(select(User).where(User.employee_code == "VG1429")).all()
    assert len(users) == 2
    assert {u.salon_id for u in users} == {u.salon_id for u in users}  # distinct salons


# ── Full real-file import ────────────────────────────────────────────────────

def test_real_client_csv_imports_cleanly(session: Session):
    assert CLIENT_CSV.exists(), f"missing client CSV at {CLIENT_CSV}"
    rows = _parse_csv(CLIENT_CSV.read_text(encoding="utf-8-sig"))
    result = import_client_export(session, rows, week_start=WEEK_START)

    assert result.errors == [], result.errors
    assert result.skipped == 0
    assert result.salons_created == 16
    # 57 employees from the original 06-26 snapshot + VG-1502/1503/1504, who were
    # discovered in the client's later daily exports and added to the roster with
    # blank weekly figures (their real days arrive via the daily imports).
    assert result.users_created == 60
    assert result.weeks_inserted == 60

    # Every week whose roster row carried revenue has a positive production
    # sourced from Net service Rev; the three added rows carry no weekly figures.
    weeks = session.exec(select(Week)).all()
    assert len(weeks) == 60
    with_revenue = [w for w in weeks if w.actual_production is not None]
    assert len(with_revenue) == 57
    assert all((w.actual_production or 0) > 0 for w in with_revenue)

    # The three employees discovered in the daily exports land in the salons the
    # exports name for them.
    salon_by_code = {
        "VG1502": "Wichita Falls Lawrence,TX",
        "VG1503": "Payson, TX",
        "VG1504": "Kalispell,MT",
    }
    for code, salon_name in salon_by_code.items():
        u = session.exec(select(User).where(User.employee_code == code)).one()
        assert session.get(Salon, u.salon_id).name == salon_name

    # Spot-check a known row (KALEEN HOWARD, Payson manager, $2914.40).
    kaleen = session.exec(select(User).where(User.employee_code == "VG1235")).first()
    assert kaleen.role == UserRole.manager
    week = session.exec(select(Week).where(Week.stylist_id == kaleen.id)).first()
    assert week.actual_production == pytest.approx(2914.40)


def test_import_client_endpoint(client):
    csv_text = CLIENT_CSV.read_text(encoding="utf-8-sig")
    files = {"file": ("PPH Data.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-client?week_start=2026-06-22", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["salons_created"] == 16
    assert body["users_created"] == 60
    assert body["weeks_inserted"] == 60
    assert body["errors"] == []


def test_import_client_defaults_week_start(client):
    csv_text = (
        "Salon,Salon Name,Employee code,Employee Name,Position,Guaranteed Pay-Rate,"
        "Scheduled hours,Hours worked,Net service Rev,Avg Haircut,Avg Color\n"
        '"11016-Burleson,TX-SSF","Burleson, TX",VG1116,LINDA JONES,Manager,12,61,62.92,"_($* 2418.15_)",23,85\n'
    )
    files = {"file": ("x.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-client", files=files)
    assert r.status_code == 200, r.text
    # week_start defaults to a Monday.
    assert date.fromisoformat(r.json()["week_start"]).weekday() == 0


def test_import_client_template(client):
    r = client.get(f"{PP}/admin/import-client-template")
    assert r.status_code == 200
    assert "Employee code" in r.text
    assert "Net service Rev" in r.text

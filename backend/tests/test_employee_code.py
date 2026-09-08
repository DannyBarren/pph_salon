"""Employee code on create/update/read + daily-import match + skip-list create."""

from __future__ import annotations

import io

import pytest
from app.db.session import get_session
from app.main import app
from app.models import DailyPerformance, Salon, User
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

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


def _seed_salon(engine, name="Burleson, TX", location="11016-Burleson,TX-SSF") -> int:
    with Session(engine) as s:
        salon = Salon(name=name, location=location)
        s.add(salon)
        s.commit()
        s.refresh(salon)
        return salon.id


def _daily_csv(employee_id: str, name: str = "New Stylist", salon: str = "Burleson,TX") -> bytes:
    text = (
        "employee_id,salon_name,sale_date,scheduled_hrs,actual_hrs,"
        "actual_haircuts,actual_colors,service_revenue,Employee Name,pay_period,Include/Exclude\n"
        f'{employee_id},"{salon}",6/22/2026,5,4.5,2,0,100,{name},'
        "06-22-2026 to 07-05-2026,Include\n"
    )
    return text.encode()


def test_create_stylist_with_code_is_pending_and_listed(client, engine):
    salon_id = _seed_salon(engine)
    r = client.post(
        f"{PP}/users",
        json={
            "name": "Pat Rivera",
            "role": "stylist",
            "salon_id": salon_id,
            "employee_code": "VG-9999",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["employee_code"] == "VG9999"
    assert body["status"] == "pending_setup"
    assert body["has_password"] is False
    assert body["email"] is None

    listed = client.get(f"{PP}/users").json()
    match = next(u for u in listed if u["id"] == body["id"])
    assert match["employee_code"] == "VG9999"


def test_create_stylist_without_code_is_422(client, engine):
    salon_id = _seed_salon(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "No Code", "role": "stylist", "salon_id": salon_id},
    )
    assert r.status_code == 422


def test_create_manager_without_code_is_422(client, engine):
    salon_id = _seed_salon(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "No Code Mgr", "role": "manager", "salon_id": salon_id},
    )
    assert r.status_code == 422


def test_duplicate_employee_code_is_409(client, engine):
    salon_id = _seed_salon(engine)
    first = client.post(
        f"{PP}/users",
        json={"name": "One", "role": "stylist", "salon_id": salon_id, "employee_code": "VG-1505"},
    )
    assert first.status_code == 201, first.text
    dup = client.post(
        f"{PP}/users",
        json={"name": "Two", "role": "stylist", "salon_id": salon_id, "employee_code": "VG1505"},
    )
    assert dup.status_code == 409
    assert "already in use at this salon" in dup.json()["detail"].lower()


def test_create_then_daily_import_matches_hyphen_optional(client, engine):
    """Create VG-9999 (stored VG9999); a daily row with VG9999 attaches."""
    salon_id = _seed_salon(engine)
    created = client.post(
        f"{PP}/users",
        json={"name": "Pat Rivera", "role": "stylist", "salon_id": salon_id, "employee_code": "VG-9999"},
    ).json()
    uid = created["id"]

    files = {"file": ("daily.csv", io.BytesIO(_daily_csv("VG9999", "Pat Rivera")), "text/csv")}
    r = client.post(f"{PP}/admin/import-daily", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["inserted"] == 1
    assert body["skipped"] == 0

    with Session(engine) as s:
        days = s.exec(select(DailyPerformance)).all()
        assert len(days) == 1
        week = days[0]
        from app.models import Week
        parent = s.get(Week, week.week_id)
        assert parent is not None
        assert parent.stylist_id == uid


def test_hyphenated_file_matches_compact_stored_code(client, engine):
    salon_id = _seed_salon(engine)
    created = client.post(
        f"{PP}/users",
        json={"name": "Pat Rivera", "role": "stylist", "salon_id": salon_id, "employee_code": "VG9999"},
    ).json()
    files = {"file": ("daily.csv", io.BytesIO(_daily_csv("VG-9999", "Pat Rivera")), "text/csv")}
    r = client.post(f"{PP}/admin/import-daily", files=files)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 1
    with Session(engine) as s:
        user = s.get(User, created["id"])
        assert user.employee_code == "VG9999"


def test_unknown_employee_populates_skip_list_then_create_attaches(client, engine):
    salon_id = _seed_salon(engine)
    files = {
        "file": (
            "daily.csv",
            io.BytesIO(_daily_csv("VG-8888", "Casey Lee", "Burleson,TX")),
            "text/csv",
        )
    }
    first = client.post(f"{PP}/admin/import-daily", files=files)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["inserted"] == 0
    assert body["skipped"] == 1
    assert body["skipped_employees"]
    skipped = body["skipped_employees"][0]
    assert skipped["employee_code"] == "VG-8888"
    assert skipped["name"] == "Casey Lee"
    assert "Burleson" in (skipped["salon_name"] or "")
    assert body["period_start"] == "2026-06-22"
    assert body["period_end"] == "2026-06-22"

    created = client.post(
        f"{PP}/users",
        json={
            "name": skipped["name"],
            "role": "stylist",
            "salon_id": salon_id,
            "employee_code": skipped["employee_code"],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending_setup"
    assert created.json()["employee_code"] == "VG8888"

    files2 = {
        "file": (
            "daily.csv",
            io.BytesIO(_daily_csv("VG-8888", "Casey Lee", "Burleson,TX")),
            "text/csv",
        )
    }
    second = client.post(f"{PP}/admin/import-daily", files=files2)
    assert second.status_code == 200, second.text
    assert second.json()["inserted"] == 1
    assert second.json()["skipped"] == 0
    assert second.json()["skipped_employees"] == []


def test_owner_without_employee_code_is_allowed(client, engine):
    salon_id = _seed_salon(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "HQ Owner", "role": "owner", "salon_id": salon_id},
    )
    assert r.status_code == 201, r.text
    assert r.json()["employee_code"] is None


def test_patch_employee_code_and_collision(client, engine):
    salon_id = _seed_salon(engine)
    a = client.post(
        f"{PP}/users",
        json={"name": "A", "role": "stylist", "salon_id": salon_id, "employee_code": "VG1111"},
    ).json()
    b = client.post(
        f"{PP}/users",
        json={"name": "B", "role": "stylist", "salon_id": salon_id, "employee_code": "VG2222"},
    ).json()
    ok = client.patch(f"{PP}/users/{a['id']}", json={"employee_code": "VG-1111"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["employee_code"] == "VG1111"
    clash = client.patch(f"{PP}/users/{b['id']}", json={"employee_code": "VG-1111"})
    assert clash.status_code == 409


def test_same_code_in_two_salons_is_allowed(client, engine):
    salon_a = _seed_salon(engine, "Burleson, TX", "11016-Burleson,TX-SSF")
    salon_b = _seed_salon(engine, "Casper, WY", "11931-Casper Cy Ave. WY-SSF")
    a = client.post(
        f"{PP}/users",
        json={"name": "Michelle A", "role": "stylist", "salon_id": salon_a, "employee_code": "VG1505"},
    )
    b = client.post(
        f"{PP}/users",
        json={"name": "Michelle B", "role": "stylist", "salon_id": salon_b, "employee_code": "VG-1505"},
    )
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text
    assert a.json()["id"] != b.json()["id"]
    assert a.json()["employee_code"] == "VG1505"
    assert b.json()["employee_code"] == "VG1505"
    assert a.json()["salon_id"] == salon_a
    assert b.json()["salon_id"] == salon_b


def test_patch_hyphen_noop_on_existing_code_is_200(client, engine):
    salon_id = _seed_salon(engine)
    created = client.post(
        f"{PP}/users",
        json={"name": "Pat", "role": "stylist", "salon_id": salon_id, "employee_code": "VG1505"},
    ).json()
    r = client.patch(f"{PP}/users/{created['id']}", json={"employee_code": "VG-1505"})
    assert r.status_code == 200, r.text
    assert r.json()["employee_code"] == "VG1505"


def test_patch_into_salon_that_already_has_code_is_409(client, engine):
    salon_a = _seed_salon(engine, "Burleson, TX", "11016-Burleson,TX-SSF")
    salon_b = _seed_salon(engine, "Casper, WY", "11931-Casper Cy Ave. WY-SSF")
    client.post(
        f"{PP}/users",
        json={"name": "In A", "role": "stylist", "salon_id": salon_a, "employee_code": "VG1505"},
    )
    in_b = client.post(
        f"{PP}/users",
        json={"name": "In B", "role": "stylist", "salon_id": salon_b, "employee_code": "VG1505"},
    ).json()
    clash = client.patch(f"{PP}/users/{in_b['id']}", json={"salon_id": salon_a})
    assert clash.status_code == 409
    assert "already in use at this salon" in clash.json()["detail"].lower()


def test_dual_salon_daily_row_attaches_to_named_salon(client, engine):
    """VG1505 in A and B; a daily row tagged with salon B attaches to B, not A."""
    salon_a = _seed_salon(engine, "Burleson, TX", "11016-Burleson,TX-SSF")
    salon_b = _seed_salon(engine, "Casper Cy Ave,WY", "11931-Casper Cy Ave. WY-SSF")
    a = client.post(
        f"{PP}/users",
        json={"name": "Michelle Moore", "role": "stylist", "salon_id": salon_a, "employee_code": "VG1505"},
    ).json()
    b = client.post(
        f"{PP}/users",
        json={"name": "Michelle Moore", "role": "stylist", "salon_id": salon_b, "employee_code": "VG1505"},
    ).json()
    assert a["id"] != b["id"]

    files = {
        "file": (
            "daily.csv",
            io.BytesIO(_daily_csv("VG-1505", "Michelle Moore", "Casper Cy Ave,WY")),
            "text/csv",
        )
    }
    r = client.post(f"{PP}/admin/import-daily", files=files)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 1
    assert r.json()["skipped"] == 0

    with Session(engine) as s:
        from app.models import Week
        weeks = list(s.exec(select(Week)).all())
        assert len(weeks) == 1
        assert weeks[0].stylist_id == b["id"]
        assert weeks[0].stylist_id != a["id"]


def test_users_template_includes_employee_code(client):
    header = client.get(f"{PP}/admin/import-users-template").text.splitlines()[0]
    assert "employee_code" in header.split(",")

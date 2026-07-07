"""Tests for weekly-data repository, role scoping, and the bulk import endpoint."""

from __future__ import annotations

from datetime import date

import pytest
from app.api.deps import get_current_user, visible_stylist_ids
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole, Week
from app.schemas.weekly import WeeklyDataInput, WeeklyImportRow
from app.services.weekly_repo import (
    get_stylists_by_salon,
    upsert_weekly_data_by_user_and_week,
)
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def session(engine):
    with Session(engine) as s:
        yield s


def _seed_salon_and_stylist(session: Session) -> tuple[Salon, User]:
    salon = Salon(name="Aria Studio", service_prices={"haircut": 23, "color": 85})
    session.add(salon)
    session.commit()
    stylist = User(name="Rebeca", role=UserRole.stylist, salon_id=salon.id)
    session.add(stylist)
    session.commit()
    session.refresh(salon)
    session.refresh(stylist)
    return salon, stylist


def test_upsert_inserts_then_updates_and_derives_production(session: Session):
    _, stylist = _seed_salon_and_stylist(session)

    data = WeeklyDataInput(scheduled_hrs=27.25, actual_hrs=26, actual_haircuts=10, actual_colors=5)
    week, created = upsert_weekly_data_by_user_and_week(session, stylist.id, date(2026, 6, 29), data)
    assert created is True
    # 10*23 + 5*85 = 230 + 425 = 655
    assert week.actual_production == 655
    assert week.scheduled_total_hrs == 27.25

    # Re-upsert same key → update, not duplicate.
    data2 = WeeklyDataInput(scheduled_hrs=27.25, actual_hrs=27, actual_haircuts=12, actual_colors=6, notes="edited")
    week2, created2 = upsert_weekly_data_by_user_and_week(session, stylist.id, date(2026, 6, 29), data2)
    assert created2 is False
    assert week2.id == week.id
    assert week2.actual_production == 12 * 23 + 6 * 85
    assert week2.notes == "edited"
    assert len(session.query(Week).all()) == 1


def test_upsert_handles_zero_hour_week(session: Session):
    _, stylist = _seed_salon_and_stylist(session)
    data = WeeklyDataInput(scheduled_hrs=0, actual_hrs=0, actual_haircuts=0, actual_colors=0)
    week, _ = upsert_weekly_data_by_user_and_week(session, stylist.id, date(2026, 6, 29), data)
    assert week.scheduled_total_hrs == 0
    assert week.actual_production == 0


def test_get_stylists_by_salon_scopes_correctly(session: Session):
    salon_a, stylist_a = _seed_salon_and_stylist(session)
    salon_b = Salon(name="Lumière")
    session.add(salon_b)
    session.commit()
    session.add(User(name="Other", role=UserRole.stylist, salon_id=salon_b.id))
    session.add(User(name="Manager", role=UserRole.manager, salon_id=salon_a.id))
    session.commit()

    stylists = get_stylists_by_salon(session, salon_a.id)
    assert [s.name for s in stylists] == ["Rebeca"]


def test_visible_stylist_ids_by_role(session: Session):
    salon, stylist = _seed_salon_and_stylist(session)
    manager = User(name="Mgr", role=UserRole.manager, salon_id=salon.id)
    owner = User(name="Own", role=UserRole.owner, salon_id=salon.id)
    session.add_all([manager, owner])
    session.commit()
    session.refresh(manager)
    session.refresh(owner)

    # Manager sees stylists in their salon; owner sees all stylists; stylist self.
    assert visible_stylist_ids(manager, session) == [stylist.id]
    assert visible_stylist_ids(owner, session) == [stylist.id]
    assert visible_stylist_ids(stylist, session) == [stylist.id]


def test_import_weekly_endpoint(engine):
    # Seed data in the shared in-memory engine.
    with Session(engine) as s:
        salon = Salon(name="Aria Studio", service_prices={"haircut": 23, "color": 85})
        s.add(salon)
        s.commit()
        s.add(User(id=18939, name="Rebeca", role=UserRole.stylist, salon_id=salon.id))
        s.commit()

    def _override_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override_session
    try:
        client = TestClient(app)
        csv_body = (
            "user_id,salon_name,week_start,guarantee_rate,scheduled_hrs,actual_hrs,"
            "actual_haircuts,actual_colors,actual_other_value,notes\n"
            "18939,Aria Studio,2026-06-29,12,27.25,26,10,5,0,Solid week\n"
            "99999,Aria Studio,2026-06-29,12,20,20,5,5,0,Unknown user\n"
        )
        resp = client.post(
            "/api/v1/admin/import-weekly",
            files={"file": ("weekly.csv", csv_body, "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["inserted"] == 1
        assert body["skipped"] == 1  # unknown user

        # Verify persisted + guarantee rate applied.
        with Session(engine) as s:
            week = s.query(Week).filter(Week.stylist_id == 18939).one()
            assert week.actual_production == 655
            user = s.get(User, 18939)
            assert user.guarantee_rate == 12
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_current_user, None)


def test_import_template_download():
    client = TestClient(app)
    resp = client.get("/api/v1/admin/import-template")
    assert resp.status_code == 200
    assert "user_id,salon_name,week_start" in resp.text


def test_weekly_import_row_schema_defaults():
    row = WeeklyImportRow(user_id=1, week_start=date(2026, 6, 29))
    assert row.scheduled_hrs == 0.0
    assert row.actual_haircuts is None

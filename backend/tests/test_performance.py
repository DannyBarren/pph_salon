"""Historical performance read endpoints: weeks, pay-periods, and week detail."""

from __future__ import annotations

from datetime import date

import pytest
from app.db.session import get_session
from app.main import app
from app.models import DailyPerformance, Salon, User, UserRole, Week
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

PP = "/api/v1"


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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


def _as(uid: int) -> dict[str, str]:
    return {"X-Demo-User-Id": str(uid)}


def _seed(engine) -> dict[str, int]:
    with Session(engine) as s:
        s.add(Salon(id=1, name="Aria"))
        s.add(Salon(id=2, name="Lumiere"))
        s.commit()
        mgr = User(name="Mgr", role=UserRole.manager, salon_id=1, email="mgr@x.com")
        stylist = User(name="Reb", role=UserRole.stylist, salon_id=1, email="reb@x.com")
        other = User(name="Other", role=UserRole.stylist, salon_id=2, email="o@x.com")
        for u in (mgr, stylist, other):
            s.add(u)
        s.commit()
        for u in (mgr, stylist, other):
            s.refresh(u)
        # Two consecutive weeks inside the client's first real pay period
        # (06-22 → 07-05) + one week three periods earlier.
        w1 = Week(stylist_id=stylist.id, week_start=date(2026, 6, 22), week_end=date(2026, 6, 28),
                  scheduled_total_hrs=40, actual_total_hrs=38, actual_production=900,
                  actual_haircuts=20, actual_colors=8)
        w2 = Week(stylist_id=stylist.id, week_start=date(2026, 6, 29), week_end=date(2026, 7, 5),
                  scheduled_total_hrs=40, actual_total_hrs=39, actual_production=1000,
                  actual_haircuts=22, actual_colors=9)
        w_old = Week(stylist_id=stylist.id, week_start=date(2026, 6, 1), week_end=date(2026, 6, 7),
                     scheduled_total_hrs=40)
        for w in (w1, w2, w_old):
            s.add(w)
        s.commit()
        s.refresh(w2)
        s.add(DailyPerformance(week_id=w2.id, date=date(2026, 6, 29), scheduled_hrs=8,
                               actual_hrs=8, actual_production=200, haircuts=5, colors=2))
        s.add(DailyPerformance(week_id=w2.id, date=date(2026, 6, 30), scheduled_hrs=8,
                               actual_hrs=7.5, actual_production=180, haircuts=4, colors=2))
        s.commit()
        return {"mgr": mgr.id, "stylist": stylist.id, "other": other.id}


def test_list_weeks_newest_first(client, engine):
    ids = _seed(engine)
    r = client.get(f"{PP}/performance/weeks?stylist_id={ids['stylist']}", headers=_as(ids["mgr"]))
    assert r.status_code == 200, r.text
    weeks = r.json()
    starts = [w["week_start"] for w in weeks]
    assert starts == ["2026-06-29", "2026-06-22", "2026-06-01"]
    assert weeks[0]["has_actuals"] is True
    assert weeks[-1]["has_actuals"] is False


def test_pay_periods_group_biweekly_newest_first(client, engine):
    ids = _seed(engine)
    r = client.get(f"{PP}/performance/pay-periods?stylist_id={ids['stylist']}", headers=_as(ids["stylist"]))
    assert r.status_code == 200, r.text
    periods = r.json()
    # Two periods: {06-22, 06-29} newest — exactly the client's 06-22→07-05
    # payroll period — and {06-01} older.
    assert len(periods) == 2
    newest = periods[0]
    assert newest["period_start"] == "2026-06-22"
    assert newest["period_end"] == "2026-07-05"
    assert [w["week_start"] for w in newest["weeks"]] == ["2026-06-22", "2026-06-29"]
    assert periods[1]["weeks"][0]["week_start"] == "2026-06-01"


def test_get_week_returns_daily_breakdown(client, engine):
    ids = _seed(engine)
    r = client.get(
        f"{PP}/performance/week?stylist_id={ids['stylist']}&week_start=2026-06-29",
        headers=_as(ids["stylist"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["actual_production"] == 1000
    assert len(body["daily"]) == 2
    assert body["daily"][0]["date"] == "2026-06-29"


def test_get_week_empty_when_no_data(client, engine):
    ids = _seed(engine)
    r = client.get(
        f"{PP}/performance/week?stylist_id={ids['stylist']}&week_start=2026-05-04",
        headers=_as(ids["stylist"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["week_start"] == "2026-05-04"
    assert body["daily"] == []
    assert body["actual_production"] is None


def test_stylist_cannot_view_other_stylist(client, engine):
    ids = _seed(engine)
    r = client.get(f"{PP}/performance/weeks?stylist_id={ids['other']}", headers=_as(ids["stylist"]))
    assert r.status_code == 403


def test_manager_cannot_view_other_salon(client, engine):
    ids = _seed(engine)
    r = client.get(f"{PP}/performance/weeks?stylist_id={ids['other']}", headers=_as(ids["mgr"]))
    assert r.status_code == 403


def test_stylist_defaults_to_self(client, engine):
    ids = _seed(engine)
    r = client.get(f"{PP}/performance/weeks", headers=_as(ids["stylist"]))
    assert r.status_code == 200
    assert len(r.json()) == 3

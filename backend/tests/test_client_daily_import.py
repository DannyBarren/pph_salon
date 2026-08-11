"""End-to-end coverage for the client's real DAILY exports.

These lock the daily import path to the files the client actually sends:

* ``v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`` — the v2 per-day template, whose
  header cells carry two names in one cell (``week_start`` above ``sale_date``,
  ``actual_other_value`` above ``service_revenue``). The whole workbook is
  imported and every weekly aggregate is compared against the spreadsheet.
* their raw per-day export (``Salon Name | Employee ID | … | Service Sale |
  Haircuts | Color | Include/Exclude``) — the layout that comes straight out of
  their reporting tool.

Both must land as DAILY rows with ``service_revenue`` as the authoritative
production (never re-derived from haircuts × price + colors × price).
"""

from __future__ import annotations

import io
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from app.db.session import get_session
from app.main import app
from app.models import DailyPerformance, Salon, User, UserRole, Week
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

PP = "/api/v1"
REPO_ROOT = Path(__file__).resolve().parents[2]
V2_WORKBOOK = REPO_ROOT / "v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# The v2 header cells, exactly as the client's workbook spells them.
V2_HEADERS = [
    "employee_id", "salon_name", "week_start\nsale_date", "scheduled_hrs",
    "actual_hrs", "actual_haircuts", "actual_colors",
    "actual_other_value\nservice_revenue", "Employee Name", "pay_period",
    "Include/Exclude",
]


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


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _upload(client, name: str, content: bytes, mime: str = XLSX_MIME):
    return client.post(f"{PP}/admin/import-daily", files={"file": (name, io.BytesIO(content), mime)})


def _xlsx_bytes(headers: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_v2_xlsx_headers_upload_as_daily_rows(client, engine):
    """An .xlsx whose header cells hold two column names (the v2 layout) imports
    as daily rows, with service_revenue as the day's production."""
    with Session(engine) as s:
        salon = Salon(name="Burleson, TX", location="11016-Burleson,TX-SSF")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        u = User(name="Holliean Miller", role=UserRole.stylist, salon_id=salon.id,
                 employee_code="VG1426", excluded=False)
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id

    content = _xlsx_bytes(
        V2_HEADERS,
        [
            ["VG-1426", "Burleson,TX", "6/22/2026", 5, 4.52, 3, 0, 113,
             "Holliean Miller", "06-22-2026 to 07-05-2026", "Exclude"],
            ["VG-1426", "Burleson,TX", "6/27/2026", 6, 5.38, 7, 0, 167.7,
             "Holliean Miller", "06-22-2026 to 07-05-2026", "Exclude"],
        ],
    )
    r = _upload(client, "v2.PPH Data.xlsx", content)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 2

    with Session(engine) as s:
        week = s.exec(select(Week).where(Week.stylist_id == uid)).one()
        assert week.week_start.isoformat() == "2026-06-22"
        assert week.actual_production == pytest.approx(113 + 167.7)
        assert week.actual_haircuts == 10
        assert week.actual_total_hrs == pytest.approx(4.52 + 5.38)
        assert s.get(User, uid).excluded is True


def test_raw_client_per_day_export_layout(client, engine):
    """Their raw per-day export names revenue ``Service Sale`` and colors
    ``Color``; both must map (a dropped column would silently re-derive
    production from counts × price)."""
    with Session(engine) as s:
        salon = Salon(name="Burleson, TX", location="11016-Burleson,TX")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        u = User(name="Holliean Miller", role=UserRole.stylist, salon_id=salon.id,
                 employee_code="VG1426", excluded=True)
        s.add(u)
        s.commit()
        s.refresh(u)
        uid = u.id

    csv_text = (
        "Salon Name,Employee ID,Employee Name,Sale Date,Scheduled Hours,"
        "Actual Hours,Service Sale,Haircuts,Color,Include/Exclude\n"
        '"11016-Burleson,TX",VG-1426,Holliean Miller,7/6/2026,5,5.28,88.7,3,1,Include\n'
        '"11016-Burleson,TX",VG-1426,Holliean Miller,7/7/2026,5,4.1,60,2,0,Include\n'
    )
    r = _upload(client, "PPH Data 07-06-2026.csv", csv_text.encode(), "text/csv")
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 2

    with Session(engine) as s:
        week = s.exec(select(Week).where(Week.stylist_id == uid)).one()
        assert week.week_start.isoformat() == "2026-07-06"
        # Service Sale is authoritative: NOT 5*23 + 1*85 = 200.
        assert week.actual_production == pytest.approx(88.7 + 60.0)
        assert week.actual_haircuts == 5
        assert week.actual_colors == 1
        # Include → not excluded from the pay plan.
        assert s.get(User, uid).excluded is False


@pytest.mark.skipif(not V2_WORKBOOK.exists(), reason="client workbook not in the repo")
def test_real_v2_workbook_imports_and_ties_out(client, engine):
    """Import the client's actual v2 workbook and verify every weekly aggregate
    equals the sum of that employee's day rows in the spreadsheet."""
    wb = load_workbook(V2_WORKBOOK, read_only=True, data_only=True)
    sheet_rows = list(wb.active.iter_rows(values_only=True))
    assert [str(h) for h in sheet_rows[0]] == V2_HEADERS, "workbook layout changed"
    data = [r for r in sheet_rows[1:] if r and r[0]]

    # Seed the roster the file expects: employee codes are stored without the
    # hyphen (as the client's roster export spells them).
    with Session(engine) as s:
        salon_ids: dict[str, int] = {}
        for row in data:
            if row[1] not in salon_ids:
                salon = Salon(name=str(row[1]))
                s.add(salon)
                s.flush()
                salon_ids[row[1]] = salon.id
        seen: set[str] = set()
        for row in data:
            code = str(row[0]).replace("-", "")
            if code in seen:
                continue
            seen.add(code)
            s.add(User(name=str(row[8]), role=UserRole.stylist,
                       salon_id=salon_ids[row[1]], employee_code=code))
        s.commit()

    content = V2_WORKBOOK.read_bytes()
    body = _upload(client, V2_WORKBOOK.name, content).json()
    assert body["errors"] == []
    assert body["skipped"] == 0
    assert body["inserted"] == len(data)

    # Expected per (employee, week) totals, straight from the spreadsheet.
    expected: dict[tuple[str, date], list[float]] = defaultdict(lambda: [0.0, 0.0, 0, 0, 0.0])
    excluded_flag: dict[str, bool] = {}
    for row in data:
        code = str(row[0]).replace("-", "")
        day = datetime.strptime(str(row[2]), "%m/%d/%Y").date()
        totals = expected[(code, _monday(day))]
        totals[0] += float(row[3] or 0)
        totals[1] += float(row[4] or 0)
        totals[2] += int(row[5] or 0)
        totals[3] += int(row[6] or 0)
        totals[4] += float(row[7] or 0)
        excluded_flag[code] = str(row[10]).strip().lower() == "exclude"

    with Session(engine) as s:
        assert len(s.exec(select(DailyPerformance)).all()) == len(data)
        assert {w.week_start.isoformat() for w in s.exec(select(Week)).all()} == {
            "2026-06-22", "2026-06-29"
        }
        users = {u.employee_code: u for u in s.exec(select(User)).all()}
        for (code, week_start), totals in expected.items():
            week = s.exec(
                select(Week).where(Week.stylist_id == users[code].id,
                                   Week.week_start == week_start)
            ).one()
            assert week.scheduled_total_hrs == pytest.approx(totals[0])
            assert (week.actual_total_hrs or 0.0) == pytest.approx(totals[1])
            assert (week.actual_haircuts or 0) == totals[2]
            assert (week.actual_colors or 0) == totals[3]
            # Production is the summed service_revenue — never counts × price.
            assert (week.actual_production or 0.0) == pytest.approx(totals[4])
        for code, want in excluded_flag.items():
            assert users[code].excluded is want

    # Re-importing the same workbook updates in place instead of duplicating.
    again = _upload(client, V2_WORKBOOK.name, content).json()
    assert again["inserted"] == 0
    assert again["updated"] == len(data)
    with Session(engine) as s:
        assert len(s.exec(select(DailyPerformance)).all()) == len(data)

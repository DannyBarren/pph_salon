"""Admin data-management endpoints.

Covers the three privileged import flows plus audit-log access:

* ``/admin/import-weekly`` — bulk weekly stylist data (CSV/XLSX), idempotent
  upsert keyed by ``user_id`` + ``week_start``. Supports a ``source`` selector
  (``native`` | ``zenoti`` | ``paycor``) that normalises vendor columns.
* ``/admin/import-daily`` — daily performance rows that also maintain the parent
  ``Week`` aggregate.
* ``/admin/import-users`` — bulk-provision hundreds of users from a CSV
  (email, name, role, salon_id/salon_name, manager_id/manager_email).
* ``/admin/audit`` — read the audit trail.

All mutating endpoints require a super-admin and are audit-logged. Templates are
downloadable but still require authentication (no public data-shape leakage).
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlmodel import Session, select

from app.api.deps import require_super_admin
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.session import get_session
from app.models import Salon, User
from app.schemas.audit import AuditLogRead
from app.schemas.user import BulkUserResult
from app.schemas.weekly import ClientImportResult, WeeklyImportResult, WeeklyImportRow
from app.services.audit import list_audit, record_audit
from app.services.importers import (
    bulk_create_users,
    import_client_export,
    normalize_daily_rows,
    normalize_weekly_rows,
    parse_bool,
)
from app.services.weekly_repo import (
    get_salon_by_name,
    upsert_daily_performance,
    upsert_weekly_data_by_user_and_week,
    week_start_for,
)

router = APIRouter(prefix="/admin", tags=["admin"])

_IMPORT_LIMIT = get_settings().rate_limit_import

# The canonical weekly import column order (also used for the template).
TEMPLATE_COLUMNS = [
    "user_id",
    "salon_name",
    "week_start",
    "guarantee_rate",
    "scheduled_hrs",
    "actual_hrs",
    "actual_haircuts",
    "actual_colors",
    "actual_other_value",
    "notes",
]

_TEMPLATE_SAMPLE = [
    # Historical / back-dated pay periods import exactly like the current one —
    # just set an earlier week_start (e.g. June 8 or June 15).
    ["18939", "Aria Studio", "2026-06-08", "12", "27.25", "26.5", "18", "9", "40", "Back-filled period"],
    ["18939", "Aria Studio", "2026-06-29", "12", "27.25", "26.5", "18", "9", "40", "Great color week"],
    ["11027", "Aria Studio", "2026-06-29", "13", "28", "0", "0", "0", "0", "Full-week call-off (sick)"],
]

USERS_TEMPLATE_COLUMNS = [
    "email", "name", "role", "salon_id", "salon_name", "manager_id",
    "manager_email", "title", "phone", "guarantee_rate", "excluded", "password",
]

_USERS_TEMPLATE_SAMPLE = [
    # Leave `password` blank to auto-generate a temp password, or set an initial
    # login password the team member can change later. `excluded` = Y for people
    # NOT on the PPH pay plan (e.g. managers who only oversee a team).
    ["rebeca@aria.com", "Rebeca Diaz", "stylist", "1", "Aria Studio", "", "gm@aria.com", "Senior Stylist", "555-0101", "17", "N", "Welcome123!"],
    ["gm@aria.com", "Jordan Avery", "manager", "1", "Aria Studio", "", "", "General Manager", "555-0100", "", "Y", ""],
]

# The client's daily "Data provided to App" format (exact column order).
DAILY_TEMPLATE_COLUMNS = [
    "Salon", "EEID", "EE Name", "Excl?", "Date", "Sched Hrs", "Actual Hrs",
    "Act Svc Rev($)", "Act Cuts Count", "Act Colors Count",
]

_DAILY_TEMPLATE_SAMPLE = [
    # Any date works — back-fill historical days or the current week. Days with no
    # activity can be left blank (only Date/Sched Hrs populated) or omitted.
    ["11016-Burleson,TX-SSF", "VG1426", "Holliean Miller", "N", "2026-07-20", "5", "4.03", "56.7", "3", "0"],
    ["11016-Burleson,TX-SSF", "VG1426", "Holliean Miller", "N", "2026-07-21", "0", "", "", "", ""],
    ["11016-Burleson,TX-SSF", "VG1426", "Holliean Miller", "N", "2026-07-22", "5", "6.13", "70", "2", "0"],
]

# The real client / Salon Success (SSF) export layout. One file provisions
# salons + users AND carries a week of production (Net service Rev). The
# ``week_start`` is supplied at upload time (this file has no date column).
CLIENT_TEMPLATE_COLUMNS = [
    "Salon", "Salon Name", "Employee code", "Employee Name", "Position", "Excl?",
    "Guaranteed Pay-Rate", "Scheduled hours", "Hours worked", "Net service Rev",
    "Avg Haircut", "Avg Color",
]

_CLIENT_TEMPLATE_SAMPLE = [
    # Excl? = Y marks someone NOT on the PPH pay plan (no personal PPH dashboard).
    ["11016-Burleson,TX-SSF", "Burleson, TX", "VG1116", "Linda Jones", "Manager",
     "Y", "12", "61", "62.92", "_($* 2418.15_)", "23", "85"],
    ["11016-Burleson,TX-SSF", "Burleson, TX", "VG1296", "Mariah Perez", "Stylist",
     "N", "9", "16", "15.58", "_($* 359.10_)", "23", "85"],
]


def _csv(columns: list[str], rows: list[list[str]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    writer.writerows(rows)
    return buf.getvalue()


@router.get("/import-template", response_class=PlainTextResponse)
def download_import_template(_: User = Depends(require_super_admin)) -> str:
    """Weekly import CSV template (header + two example rows)."""
    return _csv(TEMPLATE_COLUMNS, _TEMPLATE_SAMPLE)


@router.get("/import-users-template", response_class=PlainTextResponse)
def download_users_template(_: User = Depends(require_super_admin)) -> str:
    """Bulk-user import CSV template."""
    return _csv(USERS_TEMPLATE_COLUMNS, _USERS_TEMPLATE_SAMPLE)


@router.get("/import-daily-template", response_class=PlainTextResponse)
def download_daily_template(_: User = Depends(require_super_admin)) -> str:
    """Daily performance import CSV template."""
    return _csv(DAILY_TEMPLATE_COLUMNS, _DAILY_TEMPLATE_SAMPLE)


@router.get("/import-client-template", response_class=PlainTextResponse)
def download_client_template(_: User = Depends(require_super_admin)) -> str:
    """Client / SSF combined roster + weekly-performance import template."""
    return _csv(CLIENT_TEMPLATE_COLUMNS, _CLIENT_TEMPLATE_SAMPLE)


def _to_float(value: str | float | int | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: str | float | int | None) -> int | None:
    f = _to_float(value)
    return int(round(f)) if f is not None else None


def _to_date(value: str | date | datetime | None) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value).strip()[:10])


def _resolve_daily_user(
    session: Session, eeid: object, name: object, salon_name: object
) -> User | None:
    """Resolve the employee for a daily row.

    EEID may be our numeric user id OR the client's employee code (e.g. VG1426).
    Falls back to matching by name, scoped to the salon when one is given.
    """
    salon = None
    if salon_name:
        # The client's "Salon" is usually the salon code (stored in location),
        # but also try the display name.
        code = str(salon_name).strip()
        salon = session.exec(select(Salon).where(Salon.location == code)).first()
        if salon is None:
            salon = get_salon_by_name(session, code)

    raw = str(eeid).strip() if eeid is not None else ""
    # 1) Numeric primary key.
    if raw.isdigit():
        user = session.get(User, int(raw))
        if user is not None:
            return user
    # 2) Employee code (optionally within the resolved salon).
    if raw:
        stmt = select(User).where(User.employee_code == raw)
        if salon is not None:
            stmt = stmt.where(User.salon_id == salon.id)
        user = session.exec(stmt).first()
        if user is not None:
            return user
    # 3) Name within the salon.
    if name and salon is not None:
        user = session.exec(
            select(User).where(User.salon_id == salon.id, User.name == str(name).strip())
        ).first()
        if user is not None:
            return user
    return None


def _parse_rows(filename: str, content: bytes) -> list[dict[str, object]]:
    """Parse a CSV or XLSX file into a list of raw column dicts."""
    name = (filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xlsm"):
        try:
            from openpyxl import load_workbook
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "openpyxl is required to parse .xlsx files",
            ) from exc
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        return [dict(zip(headers, r, strict=False)) for r in rows[1:]]

    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip(): v for k, v in row.items()} for row in reader]


async def _read_and_parse(file: UploadFile) -> list[dict[str, object]]:
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB upload cap
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 10MB)")
    try:
        return _parse_rows(file.filename or "", content)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not parse file: {exc}") from exc


@router.post("/import-weekly", response_model=WeeklyImportResult)
@limiter.limit(_IMPORT_LIMIT)
async def import_weekly(
    request: Request,
    file: UploadFile,
    source: str = "native",
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> WeeklyImportResult:
    """Bulk-import weekly data (CSV/XLSX). ``source`` maps vendor columns."""
    raw_rows = normalize_weekly_rows(await _read_and_parse(file), source)
    result = WeeklyImportResult()

    for i, raw in enumerate(raw_rows, start=2):  # row 1 is the header
        try:
            if raw.get("user_id") in (None, ""):
                continue
            row = WeeklyImportRow(
                user_id=_to_int(raw.get("user_id")),
                salon_name=(str(raw["salon_name"]).strip() if raw.get("salon_name") else None),
                week_start=_to_date(raw.get("week_start")),
                week_end=_to_date(raw.get("week_end")),
                guarantee_rate=_to_float(raw.get("guarantee_rate")),
                scheduled_hrs=_to_float(raw.get("scheduled_hrs")) or 0.0,
                actual_hrs=_to_float(raw.get("actual_hrs")),
                actual_haircuts=_to_int(raw.get("actual_haircuts")),
                actual_colors=_to_int(raw.get("actual_colors")),
                actual_other_value=_to_float(raw.get("actual_other_value")),
                notes=(str(raw["notes"]).strip() if raw.get("notes") else None),
            )
        except Exception as exc:  # noqa: BLE001
            result.skipped += 1
            result.errors.append(f"Row {i}: {exc}")
            continue

        user = session.get(User, row.user_id)
        if user is None:
            result.skipped += 1
            result.errors.append(f"Row {i}: unknown user_id {row.user_id}")
            continue

        # Cross-check the salon name against the user's salon when supplied.
        if row.salon_name:
            salon = get_salon_by_name(session, row.salon_name)
            if salon is not None and salon.id != user.salon_id:
                result.skipped += 1
                result.errors.append(
                    f"Row {i}: user {row.user_id} is not in salon '{row.salon_name}'"
                )
                continue

        if row.guarantee_rate is not None and user.guarantee_rate != row.guarantee_rate:
            user.guarantee_rate = row.guarantee_rate
            session.add(user)

        _, created = upsert_weekly_data_by_user_and_week(
            session, row.user_id, row.week_start, row, commit=False
        )
        if created:
            result.inserted += 1
        else:
            result.updated += 1

    session.commit()
    record_audit(session, actor=admin, action="import.weekly", target_type="week",
                 detail={"source": source, "inserted": result.inserted,
                         "updated": result.updated, "skipped": result.skipped})
    return result


@router.post("/import-daily", response_model=WeeklyImportResult)
@limiter.limit(_IMPORT_LIMIT)
async def import_daily(
    request: Request,
    file: UploadFile,
    source: str = "native",
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> WeeklyImportResult:
    """Bulk-import daily performance rows in the client's "Data provided to App"
    format (Salon | EEID | EE Name | Excl? | Date | Sched Hrs | Actual Hrs |
    Act Svc Rev($) | Act Cuts Count | Act Colors Count). Parent weeks are
    aggregated. Idempotent and tolerant of blank/no-activity rows.
    """
    raw_rows = normalize_daily_rows(await _read_and_parse(file), source)
    result = WeeklyImportResult()

    for i, raw in enumerate(raw_rows, start=2):
        try:
            eeid = raw.get("user_id")
            day = _to_date(raw.get("date") or raw.get("week_start"))
            # Silently skip genuinely blank rows (no employee and no date).
            if (eeid in (None, "")) and day is None:
                continue
            if eeid in (None, "") or day is None:
                raise ValueError("EEID and Date are required")
        except Exception as exc:  # noqa: BLE001
            result.skipped += 1
            result.errors.append(f"Row {i}: {exc}")
            continue

        user = _resolve_daily_user(session, eeid, raw.get("name"), raw.get("salon_name"))
        if user is None:
            result.skipped += 1
            result.errors.append(f"Row {i}: unknown employee '{eeid}'")
            continue

        # Keep the roster's Excluded flag in sync when the column is supplied.
        if str(raw.get("excluded", "")).strip() != "":
            excluded = parse_bool(raw.get("excluded"))
            if user.excluded != excluded:
                user.excluded = excluded
                session.add(user)

        _, created = upsert_daily_performance(
            session, user.id, day,
            scheduled_hrs=_to_float(raw.get("scheduled_hrs")) or 0.0,
            actual_hrs=_to_float(raw.get("actual_hrs")),
            haircuts=_to_int(raw.get("actual_haircuts")),
            colors=_to_int(raw.get("actual_colors")),
            service_rev=_to_float(raw.get("service_rev")),
            other_value=_to_float(raw.get("actual_other_value")),
            commit=False,
        )
        if created:
            result.inserted += 1
        else:
            result.updated += 1

    session.commit()
    record_audit(session, actor=admin, action="import.daily", target_type="daily_performance",
                 detail={"source": source, "inserted": result.inserted,
                         "updated": result.updated, "skipped": result.skipped})
    return result


@router.post("/import-users", response_model=BulkUserResult)
@limiter.limit(_IMPORT_LIMIT)
async def import_users(
    request: Request,
    file: UploadFile,
    email_credentials: bool = False,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> BulkUserResult:
    """Bulk-create/update users from a CSV.

    Columns: ``email, name, role, salon_id|salon_name, manager_id|manager_email,
    title, phone, guarantee_rate``. Set ``email_credentials=true`` to email temp
    passwords instead of returning them in the response.
    """
    raw_rows = await _read_and_parse(file)
    result = bulk_create_users(session, raw_rows, email_credentials=email_credentials)
    record_audit(session, actor=admin, action="user.bulk_import", target_type="user",
                 detail={"created": result.created, "updated": result.updated,
                         "skipped": result.skipped})
    return result


@router.post("/import-client", response_model=ClientImportResult)
@limiter.limit(_IMPORT_LIMIT)
async def import_client(
    request: Request,
    file: UploadFile,
    week_start: date | None = None,
    session: Session = Depends(get_session),
    admin: User = Depends(require_super_admin),
) -> ClientImportResult:
    """Import the real client / SSF export (roster + weekly performance) in one
    pass: creates salons and users as needed, sets per-employee guarantee rates
    and salon service prices (Avg Haircut / Avg Color), and records each user's
    week from Net service Rev.

    The export has no date column, so ``week_start`` is supplied here. When
    omitted it defaults to the Monday of the current week. Handles multiple
    salons in one file and is safe to re-run.
    """
    resolved_week = week_start_for(week_start) if week_start else week_start_for(date.today())
    raw_rows = await _read_and_parse(file)
    result = import_client_export(session, raw_rows, week_start=resolved_week)
    record_audit(session, actor=admin, action="import.client", target_type="week",
                 detail={"week_start": resolved_week.isoformat(),
                         "salons_created": result.salons_created,
                         "users_created": result.users_created,
                         "users_updated": result.users_updated,
                         "weeks_inserted": result.weeks_inserted,
                         "weeks_updated": result.weeks_updated,
                         "skipped": result.skipped})
    return result


@router.get("/audit", response_model=list[AuditLogRead])
def get_audit_log(
    limit: int = 200,
    salon_id: int | None = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_super_admin),
) -> list:
    """Read the audit trail (most recent first)."""
    return list_audit(session, limit=min(limit, 1000), salon_id=salon_id)

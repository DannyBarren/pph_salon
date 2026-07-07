"""Admin data-management endpoints: bulk weekly-data import + template.

Accepts a CSV or XLSX matching the downloadable template and performs idempotent
upserts keyed by ``user_id`` + ``week_start`` (see
:func:`app.services.weekly_repo.upsert_weekly_data_by_user_and_week`). This is
the "works even if Zenoti/PayCor are down" manual path.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlmodel import Session

from app.api.deps import require_role
from app.db.session import get_session
from app.models import User
from app.schemas.weekly import WeeklyImportResult, WeeklyImportRow
from app.services.weekly_repo import upsert_weekly_data_by_user_and_week

router = APIRouter(prefix="/admin", tags=["admin"])

# The canonical import column order (also used for the downloadable template).
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
    ["18939", "Aria Studio", "2026-06-29", "12", "27.25", "26.5", "18", "9", "40", "Great color week"],
    ["11027", "Aria Studio", "2026-06-29", "13", "28", "0", "0", "0", "0", "Full-week call-off (sick)"],
]


@router.get("/import-template", response_class=PlainTextResponse)
def download_import_template() -> str:
    """Return the CSV import template (header + two example rows)."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(TEMPLATE_COLUMNS)
    writer.writerows(_TEMPLATE_SAMPLE)
    return buf.getvalue()


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

    # Default: CSV / text.
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip(): v for k, v in row.items()} for row in reader]


@router.post("/import-weekly", response_model=WeeklyImportResult)
async def import_weekly(
    file: UploadFile,
    session: Session = Depends(get_session),
    _: User = Depends(require_role(["admin", "owner"])),
) -> WeeklyImportResult:
    """Bulk-import weekly data from a CSV or XLSX file.

    Each row upserts by ``user_id`` + ``week_start``. Malformed rows are skipped
    and reported in ``errors`` so a single bad row never fails the whole import.
    """
    content = await file.read()
    try:
        raw_rows = _parse_rows(file.filename or "", content)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface parse errors to the client
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not parse file: {exc}") from exc

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

        # Optionally update the stylist's guarantee rate from the sheet.
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
    return result

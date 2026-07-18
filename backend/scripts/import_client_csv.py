"""One-shot importer for the real client / SSF export (roster + weekly revenue).

Reads the client's CSV (or XLSX) and provisions salons + employees and records a
week of Net service Rev in a single pass — the same pipeline used by the Admin
panel's "Client / SSF export" import. Safe to re-run (idempotent upserts).

Usage (from the backend/ directory, with DATABASE_URL set)::

    python -m scripts.import_client_csv "../PPH Data 06-26-2026.xlsx.csv" \
        --week-start 2026-06-22

If --week-start is omitted it defaults to the Monday of the current week. The
client export has no date column, so every row is recorded against that Monday.
"""

from __future__ import annotations

import argparse
import csv
import io
from datetime import date

from app.db.session import engine
from app.services.importers import import_client_export
from app.services.weekly_repo import week_start_for
from sqlmodel import Session, SQLModel


def _parse_file(path: str) -> list[dict[str, object]]:
    lower = path.lower()
    with open(path, "rb") as fh:
        content = fh.read()
    if lower.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook

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


def main() -> None:
    parser = argparse.ArgumentParser(description="Import the client / SSF export.")
    parser.add_argument("path", help="Path to the client CSV/XLSX file")
    parser.add_argument(
        "--week-start",
        default=None,
        help="ISO Monday the rows belong to (defaults to the current week's Monday)",
    )
    args = parser.parse_args()

    ws = week_start_for(date.fromisoformat(args.week_start) if args.week_start else date.today())
    rows = _parse_file(args.path)

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        result = import_client_export(session, rows, week_start=ws)

    print(f"Week of {result.week_start}:")
    print(f"  salons created : {result.salons_created}")
    print(f"  users created  : {result.users_created} (updated {result.users_updated})")
    print(f"  weeks inserted : {result.weeks_inserted} (updated {result.weeks_updated})")
    print(f"  skipped        : {result.skipped}")
    for err in result.errors[:10]:
        print(f"  ! {err}")


if __name__ == "__main__":
    main()

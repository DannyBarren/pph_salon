"""Low-friction import of hours + production (Zenoti-style reports).

Supported input: a **per-day long format** — one row per stylist per day — which
is how Zenoti reports typically export and what people can copy-paste. Rows are
aggregated into one :class:`WeeklyData` per (user_id, week_start).

Template columns (case/space-insensitive):
    user_id, week_start, day, scheduled_hours, actual_hours, haircuts, colors, production

* ``day`` is Mon/Tue/… or 0–6 (Mon=0).
* ``production`` is optional — if blank it's derived as
  ``haircuts × haircut_price + colors × color_price``.
"""

from __future__ import annotations

import io

import pandas as pd

from calculations import COLOR_PRICE, HAIRCUT_PRICE
from data_models import WeeklyData

TEMPLATE_COLUMNS = [
    "user_id",
    "week_start",
    "day",
    "scheduled_hours",
    "actual_hours",
    "haircuts",
    "colors",
    "production",
]

_DAY_INDEX = {
    "mon": 0, "monday": 0, "0": 0,
    "tue": 1, "tues": 1, "tuesday": 1, "1": 1,
    "wed": 2, "weds": 2, "wednesday": 2, "2": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "3": 3,
    "fri": 4, "friday": 4, "4": 4,
    "sat": 5, "saturday": 5, "5": 5,
    "sun": 6, "sunday": 6, "6": 6,
}


def template_csv() -> str:
    """A ready-to-fill CSV template with two example rows."""
    sample = pd.DataFrame(
        [
            ["rebeca", "2026-06-29", "Mon", 5.25, 5.25, 3, 2, ""],
            ["rebeca", "2026-06-29", "Tue", 6.25, 6.25, 4, 2, ""],
        ],
        columns=TEMPLATE_COLUMNS,
    )
    return sample.to_csv(index=False)


def read_upload(file) -> pd.DataFrame:
    """Read an uploaded CSV or Excel file into a DataFrame."""
    name = (getattr(file, "name", "") or "").lower()
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(file)
    return pd.read_csv(file)


def parse_pasted(text: str) -> pd.DataFrame:
    """Parse copy-pasted CSV/TSV text into a DataFrame."""
    sep = "\t" if "\t" in text.splitlines()[0] else "," if text else ","
    return pd.read_csv(io.StringIO(text), sep=sep)


def _norm(col: str) -> str:
    return str(col).strip().lower().replace(" ", "_")


def parse_weekly_rows(
    df: pd.DataFrame, haircut_price: float = HAIRCUT_PRICE, color_price: float = COLOR_PRICE
) -> tuple[list[WeeklyData], list[str]]:
    """Aggregate a per-day DataFrame into WeeklyData rows.

    Returns ``(rows, errors)``; malformed lines are reported, never fatal.
    """
    df = df.rename(columns={c: _norm(c) for c in df.columns})
    errors: list[str] = []
    required = {"user_id", "week_start", "day"}
    missing = required - set(df.columns)
    if missing:
        return [], [f"Missing required column(s): {', '.join(sorted(missing))}"]

    # bucket[(user_id, week_start)] -> WeeklyData
    buckets: dict[tuple[str, str], WeeklyData] = {}

    def num(row, key) -> float:
        try:
            v = row.get(key)
            if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
                return 0.0
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    for i, row in df.iterrows():
        line = int(i) + 2
        user_id = str(row.get("user_id", "")).strip()
        week_start = str(row.get("week_start", "")).strip()[:10]
        day_raw = str(row.get("day", "")).strip().lower()
        if not user_id or not week_start:
            continue
        day = _DAY_INDEX.get(day_raw)
        if day is None:
            errors.append(f"Row {line}: unrecognized day '{row.get('day')}'")
            continue

        key = (user_id, week_start)
        wd = buckets.setdefault(key, WeeklyData(user_id=user_id, week_start=week_start))
        hc = int(round(num(row, "haircuts")))
        co = int(round(num(row, "colors")))
        prod = num(row, "production")
        if prod == 0.0 and (hc or co):
            prod = hc * haircut_price + co * color_price

        wd.scheduled_hours[day] = num(row, "scheduled_hours")
        wd.actual_hours[day] = num(row, "actual_hours")
        wd.haircuts[day] = hc
        wd.colors[day] = co
        wd.production[day] = prod

    return list(buckets.values()), errors

"""Shared UI helpers for the screens."""

from __future__ import annotations

from datetime import date, timedelta

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def money(value: float, decimals: int = 0) -> str:
    return f"${value:,.{decimals}f}"


def week_label(week_start: str) -> str:
    """Human label for a week, e.g. '6/29 – 7/5'."""
    try:
        start = date.fromisoformat(week_start)
    except ValueError:
        return week_start
    end = start + timedelta(days=6)
    return f"{start.month}/{start.day} – {end.month}/{end.day}"


def week_dates(week_start: str) -> list[str]:
    start = date.fromisoformat(week_start)
    return [(start + timedelta(days=i)).isoformat() for i in range(7)]


def over_short_color(value: float) -> str:
    """Green when at/over target, red when short (for st.markdown styling)."""
    return "#16b981" if value >= 0 else "#ef4444"


def over_short_md(value: float, decimals: int = 0) -> str:
    sign = "+" if value >= 0 else "−"
    color = over_short_color(value)
    return f"<span style='color:{color};font-weight:600'>{sign}{money(abs(value), decimals)}</span>"

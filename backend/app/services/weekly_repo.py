"""Repository helpers for stylists and weekly data.

Pure-ish data-access functions (they take an explicit ``Session``) so they can be
reused by the API layer, the bulk importer, and tests. All writes are idempotent
upserts keyed by ``(user_id, week_start)`` — the natural key from the import
template — so the same file can be re-imported safely and manual edits win.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models import DailyPerformance, Salon, User, UserRole, Week
from app.schemas.weekly import WeeklyDataInput


def normalize_salon_key(value: str) -> str:
    """Punctuation/whitespace-insensitive salon key.

    The client's roster export and their daily export spell the same salon
    differently (``Casper 2nd St,WY`` vs ``Casper, 2nd St,WY``). Comparing on
    alphanumerics only makes the importer's salon tie-breaker deterministic
    instead of silently falling through to an any-salon match.
    """
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def get_stylists_by_salon(session: Session, salon_id: int) -> list[User]:
    """All stylists belonging to a salon, ordered by name."""
    stmt = (
        select(User)
        .where(User.salon_id == salon_id, User.role == UserRole.stylist)
        .order_by(User.name)
    )
    return list(session.exec(stmt).all())


def get_salon_by_name(session: Session, name: str) -> Salon | None:
    """Resolve a salon by name — exact, then case-insensitive, then
    punctuation-insensitive (see :func:`normalize_salon_key`). Used by the
    importer. Matches are deterministic: ties break on the lowest salon id."""
    stmt = select(Salon).where(Salon.name == name)
    salon = session.exec(stmt).first()
    if salon is not None:
        return salon
    lowered = name.strip().lower()
    key = normalize_salon_key(name)
    for s in session.exec(select(Salon).order_by(Salon.id)).all():
        if s.name.strip().lower() == lowered:
            return s
    for s in session.exec(select(Salon).order_by(Salon.id)).all():
        if normalize_salon_key(s.name) == key:
            return s
    return None


def _derive_production(
    data: WeeklyDataInput, salon: Salon | None
) -> float | None:
    """Compute weekly production from service counts using the salon's prices.

    Production = haircuts × haircut_price + colors × color_price + other value.
    Returns ``None`` only when there is genuinely nothing to derive.
    """
    prices = (salon.service_prices if salon else None) or {"haircut": 23.0, "color": 85.0}
    haircut_price = float(prices.get("haircut", 23.0))
    color_price = float(prices.get("color", 85.0))

    has_any = any(
        v is not None
        for v in (data.actual_haircuts, data.actual_colors, data.actual_other_value)
    )
    if not has_any:
        return None
    return (
        (data.actual_haircuts or 0) * haircut_price
        + (data.actual_colors or 0) * color_price
        + (data.actual_other_value or 0.0)
    )


def upsert_weekly_data_by_user_and_week(
    session: Session,
    user_id: int,
    week_start: date,
    data: WeeklyDataInput,
    *,
    commit: bool = True,
) -> tuple[Week, bool]:
    """Insert or update a stylist's week, keyed by ``(user_id, week_start)``.

    Returns ``(week, created)`` where ``created`` is True on insert. Production is
    derived from the service counts and the stylist's salon service prices, so it
    stays consistent whether Zenoti is up or the data was hand-entered.
    """
    user = session.get(User, user_id)
    salon = session.get(Salon, user.salon_id) if user else None

    existing = session.exec(
        select(Week).where(Week.stylist_id == user_id, Week.week_start == week_start)
    ).first()

    production = _derive_production(data, salon)

    if existing is None:
        week = Week(
            stylist_id=user_id,
            week_start=week_start,
            week_end=data.week_end,
            scheduled_total_hrs=data.scheduled_hrs,
            actual_total_hrs=data.actual_hrs,
            actual_haircuts=data.actual_haircuts,
            actual_colors=data.actual_colors,
            actual_other_value=data.actual_other_value,
            actual_production=production,
            notes=data.notes,
        )
        session.add(week)
        created = True
    else:
        existing.week_end = data.week_end if data.week_end is not None else existing.week_end
        existing.scheduled_total_hrs = data.scheduled_hrs
        existing.actual_total_hrs = data.actual_hrs
        existing.actual_haircuts = data.actual_haircuts
        existing.actual_colors = data.actual_colors
        existing.actual_other_value = data.actual_other_value
        if production is not None:
            existing.actual_production = production
        existing.notes = data.notes if data.notes is not None else existing.notes
        week = existing
        created = False

    if commit:
        session.commit()
        session.refresh(week)
    return week, created


def week_start_for(day: date) -> date:
    """Monday of the week containing ``day`` (weeks run Mon–Sun, per the spec)."""
    return day - timedelta(days=day.weekday())


def upsert_daily_performance(
    session: Session,
    user_id: int,
    day: date,
    *,
    scheduled_hrs: float = 0.0,
    actual_hrs: float | None = None,
    haircuts: int | None = None,
    colors: int | None = None,
    other_value: float | None = None,
    service_rev: float | None = None,
    commit: bool = True,
) -> tuple[DailyPerformance, bool]:
    """Insert/update one :class:`DailyPerformance` row and keep its parent Week
    aggregate in sync (sum of daily hours/production).

    Ensures a parent ``Week`` exists (keyed by the Monday of ``day``), writes the
    daily row, then recomputes the week totals from *all* its daily rows so the
    weekly view and the daily breakdown never drift apart.

    Production source (mapping only — the pay engine is unchanged):
    * ``service_rev`` — the client's authoritative "Act Svc Rev($)" for the day;
      when provided it *is* the day's production (cuts/colors are stored as
      counts only).
    * otherwise it falls back to the derived model
      ``haircuts × price + colors × price + other_value``.
    """
    user = session.get(User, user_id)
    salon = session.get(Salon, user.salon_id) if user else None
    prices = (salon.service_prices if salon else None) or {"haircut": 23.0, "color": 85.0}
    haircut_price = float(prices.get("haircut", 23.0))
    color_price = float(prices.get("color", 85.0))

    ws = week_start_for(day)
    week = session.exec(
        select(Week).where(Week.stylist_id == user_id, Week.week_start == ws)
    ).first()
    if week is None:
        week = Week(stylist_id=user_id, week_start=ws, week_end=ws + timedelta(days=6),
                    scheduled_total_hrs=0.0)
        session.add(week)
        session.flush()

    day_production = None
    if service_rev is not None:
        # Authoritative service revenue provided directly (client daily format).
        day_production = float(service_rev)
    elif any(v is not None for v in (haircuts, colors, other_value)):
        day_production = (haircuts or 0) * haircut_price + (colors or 0) * color_price + (
            other_value or 0.0)

    existing = session.exec(
        select(DailyPerformance).where(
            DailyPerformance.week_id == week.id, DailyPerformance.date == day
        )
    ).first()
    if existing is None:
        row = DailyPerformance(
            week_id=week.id, date=day, scheduled_hrs=scheduled_hrs, actual_hrs=actual_hrs,
            actual_production=day_production, haircuts=haircuts, colors=colors,
        )
        session.add(row)
        created = True
    else:
        existing.scheduled_hrs = scheduled_hrs
        existing.actual_hrs = actual_hrs
        existing.haircuts = haircuts
        existing.colors = colors
        if day_production is not None:
            existing.actual_production = day_production
        row = existing
        created = False
    session.flush()

    # Recompute weekly aggregates from all daily rows.
    dailies = session.exec(
        select(DailyPerformance).where(DailyPerformance.week_id == week.id)
    ).all()
    week.scheduled_total_hrs = sum(d.scheduled_hrs or 0.0 for d in dailies)
    week.actual_total_hrs = sum(d.actual_hrs or 0.0 for d in dailies) or None
    week.actual_haircuts = sum(d.haircuts or 0 for d in dailies) or None
    week.actual_colors = sum(d.colors or 0 for d in dailies) or None
    prod = sum(d.actual_production or 0.0 for d in dailies)
    week.actual_production = prod or None
    session.add(week)

    if commit:
        session.commit()
        session.refresh(row)
    return row, created

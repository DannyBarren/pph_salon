"""Historical performance read endpoints.

Expose the stored ``Week`` / ``DailyPerformance`` rows so the frontend can offer
a **pay-period → week** history selector: list the pay periods (and the weeks
within them) that have stored data for a stylist, then fetch a specific week's
aggregate + daily breakdown.

Data is written over time by the admin import flows (``/admin/import-weekly`` /
``/admin/import-daily`` / ``/admin/import-client``); these endpoints are the
read side, so nothing is ever lost — any past period can be selected and viewed.

Visibility mirrors the rest of the app: a stylist sees only their own data, a
manager sees stylists in their own salon, and admin/owner see anyone.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from app.api.deps import get_current_user, visible_stylist_ids
from app.db.session import get_session
from app.models import DailyPerformance, Salon, User, UserRole, Week
from app.schemas.performance import (
    DailyPerformanceRead,
    PayPeriodSummary,
    StoredWeek,
    TeamWeekResponse,
    TeamWeekStylistRecord,
    WeekPerformanceRead,
)

router = APIRouter(prefix="/performance", tags=["performance"])

# Fixed Monday anchor for deterministic biweekly pay-period grouping. Weeks run
# Mon–Sun; a pay period is two consecutive weeks. Grouping off a fixed anchor
# means the same calendar weeks always fall in the same period regardless of
# which weeks happen to have data. The anchor is aligned to the CLIENT'S payroll
# cadence — their exports label periods "06-22-2026 to 07-05-2026",
# "07-06-2026 to 07-19-2026", … — so the Pay Period dropdown shows the same
# boundaries as their payroll calendar.
_PERIOD_ANCHOR = date(2026, 6, 22)  # first week of the client's 06-22→07-05 period
_WEEKS_PER_PERIOD = 2


def _period_index(week_start: date) -> int:
    return ((week_start - _PERIOD_ANCHOR).days // 7) // _WEEKS_PER_PERIOD


def _is_super_admin(user: User) -> bool:
    """admin / owner have org-wide visibility across all salons."""
    return user.role in (UserRole.admin, UserRole.owner)


def _resolve_target(
    session: Session, actor: User, stylist_id: int | None
) -> User:
    """Resolve + authorize the stylist whose data is being read.

    Defaults to the caller when ``stylist_id`` is omitted. Enforces the standard
    visibility rules (self / own-salon / org-wide).
    """
    target_id = stylist_id if stylist_id is not None else actor.id
    if target_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No stylist specified")
    target = session.get(User, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stylist not found")

    if _is_super_admin(actor) or actor.id == target.id:
        return target
    if actor.role == UserRole.manager and target.salon_id == actor.salon_id:
        return target
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot view this stylist's data")


def _stored_week(week: Week) -> StoredWeek:
    has_actuals = any(
        v is not None
        for v in (week.actual_total_hrs, week.actual_production, week.actual_haircuts, week.actual_colors)
    )
    return StoredWeek(
        week_start=week.week_start,
        week_end=week.week_end or (week.week_start + timedelta(days=6)),
        has_actuals=has_actuals,
    )


@router.get("/weeks", response_model=list[StoredWeek])
def list_weeks(
    stylist_id: int | None = None,
    session: Session = Depends(get_session),
    actor: User = Depends(get_current_user),
) -> list[StoredWeek]:
    """Flat list of weeks that have stored data for a stylist, newest first."""
    target = _resolve_target(session, actor, stylist_id)
    weeks = session.exec(
        select(Week).where(Week.stylist_id == target.id).order_by(Week.week_start.desc())
    ).all()
    return [_stored_week(w) for w in weeks]


@router.get("/pay-periods", response_model=list[PayPeriodSummary])
def list_pay_periods(
    stylist_id: int | None = None,
    session: Session = Depends(get_session),
    actor: User = Depends(get_current_user),
) -> list[PayPeriodSummary]:
    """Pay periods (biweekly) that have stored data, newest first.

    Each period lists the stored weeks it contains (oldest first) so the UI can
    drive a period dropdown and then a week dropdown.
    """
    target = _resolve_target(session, actor, stylist_id)
    weeks = session.exec(
        select(Week).where(Week.stylist_id == target.id).order_by(Week.week_start.asc())
    ).all()

    grouped: dict[int, list[Week]] = {}
    for w in weeks:
        grouped.setdefault(_period_index(w.week_start), []).append(w)

    periods: list[PayPeriodSummary] = []
    for idx in sorted(grouped, reverse=True):  # newest period first
        start = _PERIOD_ANCHOR + timedelta(weeks=idx * _WEEKS_PER_PERIOD)
        end = start + timedelta(days=_WEEKS_PER_PERIOD * 7 - 1)
        period_weeks = sorted(grouped[idx], key=lambda w: w.week_start)
        periods.append(
            PayPeriodSummary(
                period_start=start,
                period_end=end,
                weeks=[_stored_week(w) for w in period_weeks],
            )
        )
    return periods


@router.get("/week", response_model=WeekPerformanceRead)
def get_week(
    week_start: date,
    stylist_id: int | None = None,
    session: Session = Depends(get_session),
    actor: User = Depends(get_current_user),
) -> WeekPerformanceRead:
    """A stylist's stored week: aggregate totals + the daily breakdown.

    Returns an empty (zeroed) week when nothing is stored for that Monday so the
    selector can always render the chosen week.
    """
    target = _resolve_target(session, actor, stylist_id)
    week = session.exec(
        select(Week).where(Week.stylist_id == target.id, Week.week_start == week_start)
    ).first()

    if week is None:
        return WeekPerformanceRead(
            stylist_id=target.id,
            week_start=week_start,
            week_end=week_start + timedelta(days=6),
        )

    daily = session.exec(
        select(DailyPerformance)
        .where(DailyPerformance.week_id == week.id)
        .order_by(DailyPerformance.date.asc())
    ).all()
    return WeekPerformanceRead(
        stylist_id=target.id,
        week_start=week.week_start,
        week_end=week.week_end or (week.week_start + timedelta(days=6)),
        scheduled_total_hrs=week.scheduled_total_hrs,
        actual_total_hrs=week.actual_total_hrs,
        actual_production=week.actual_production,
        actual_haircuts=week.actual_haircuts,
        actual_colors=week.actual_colors,
        actual_other_value=week.actual_other_value,
        notes=week.notes,
        daily=[DailyPerformanceRead.model_validate(d) for d in daily],
    )


@router.get("/team-week", response_model=TeamWeekResponse)
def get_team_week(
    week_start: date | None = None,
    session: Session = Depends(get_session),
    actor: User = Depends(get_current_user),
) -> TeamWeekResponse:
    """Team dashboard payload: every visible stylist's record for one week.

    Visibility matches the rest of the app (admin/owner → all stylists, manager
    → own salon, stylist → self). When ``week_start`` is omitted, the most
    recent week **with daily rows** across the visible roster is used (the
    client's daily-import path), then the most recent week with any actuals
    (weekly-only imports), then the current Monday — so the dashboard always
    opens on the latest imported data. Stylists with no stored week still
    appear, zeroed.
    """
    ids = visible_stylist_ids(actor, session)
    if not ids:
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        return TeamWeekResponse(
            week_start=monday,
            week_end=monday + timedelta(days=6),
            generated_at=datetime.now(UTC),
            records=[],
        )

    if week_start is None:
        # Prefer the latest week with real per-day rows (the client's daily
        # import path). Weekly-only imports leave no daily rows, so fall back to
        # the latest week with any actuals, then to the current Monday.
        week_start = session.exec(
            select(func.max(Week.week_start))
            .where(Week.stylist_id.in_(ids))
            .where(
                select(DailyPerformance.id)
                .where(DailyPerformance.week_id == Week.id)
                .exists()
            )
        ).first()
        if week_start is None:
            week_start = session.exec(
                select(func.max(Week.week_start)).where(
                    Week.stylist_id.in_(ids),
                    (Week.actual_production.is_not(None))  # type: ignore[union-attr]
                    | (Week.actual_total_hrs.is_not(None)),  # type: ignore[union-attr]
                )
            ).first()
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    users = session.exec(select(User).where(User.id.in_(ids)).order_by(User.name)).all()
    weeks = {
        w.stylist_id: w
        for w in session.exec(
            select(Week).where(Week.stylist_id.in_(ids), Week.week_start == week_start)
        ).all()
    }
    daily_by_week: dict[int, list[DailyPerformance]] = {}
    week_ids = [w.id for w in weeks.values()]
    if week_ids:
        for d in session.exec(
            select(DailyPerformance)
            .where(DailyPerformance.week_id.in_(week_ids))
            .order_by(DailyPerformance.date.asc())
        ).all():
            daily_by_week.setdefault(d.week_id, []).append(d)

    salon_guarantee = {
        s.id: s.guarantee_rate for s in session.exec(select(Salon)).all()
    }
    records = []
    for u in users:
        w = weeks.get(u.id)
        records.append(
            TeamWeekStylistRecord(
                stylist_id=u.id,
                employee_code=u.employee_code,
                name=u.name,
                title=u.title,
                salon_id=u.salon_id,
                guarantee_rate=(
                    u.guarantee_rate
                    if u.guarantee_rate is not None
                    else (salon_guarantee.get(u.salon_id) or 12.0)
                ),
                excluded=u.excluded,
                week_start=week_start,
                week_end=(w.week_end if w and w.week_end else week_end),
                scheduled_total_hrs=w.scheduled_total_hrs if w else 0.0,
                actual_total_hrs=w.actual_total_hrs if w else None,
                actual_production=w.actual_production if w else None,
                actual_haircuts=w.actual_haircuts if w else None,
                actual_colors=w.actual_colors if w else None,
                daily=[
                    DailyPerformanceRead.model_validate(d)
                    for d in daily_by_week.get(w.id, [])
                ]
                if w
                else [],
            )
        )
    return TeamWeekResponse(
        week_start=week_start,
        week_end=week_end,
        generated_at=datetime.now(UTC),
        records=records,
    )

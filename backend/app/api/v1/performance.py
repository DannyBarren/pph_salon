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

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user
from app.db.session import get_session
from app.models import DailyPerformance, User, UserRole, Week
from app.schemas.performance import (
    DailyPerformanceRead,
    PayPeriodSummary,
    StoredWeek,
    WeekPerformanceRead,
)

router = APIRouter(prefix="/performance", tags=["performance"])

# Fixed Monday anchor for deterministic biweekly pay-period grouping. Weeks run
# Mon–Sun; a pay period is two consecutive weeks. Grouping off a fixed anchor
# means the same calendar weeks always fall in the same period regardless of
# which weeks happen to have data.
_PERIOD_ANCHOR = date(2020, 1, 6)  # a Monday
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

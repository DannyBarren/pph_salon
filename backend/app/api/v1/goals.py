"""Goal + notification endpoints.

Permissions (strict):
* Stylists set/view only their own goals.
* Managers view + review goals for their **direct reports** only.
* SDL / admin: full access + the org hierarchy view.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user
from app.db.session import get_session
from app.models import Goal, Notification, User, UserRole
from app.schemas.goal import (
    GoalCreate,
    GoalRead,
    GoalReview,
    HierarchyManager,
    HierarchySalon,
    HierarchyStylist,
    NotificationRead,
    TeamGoalRow,
)
from app.services import goal_service

router = APIRouter(prefix="/goals", tags=["goals"])


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
def set_goal(
    payload: GoalCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Goal:
    """Set (or override) a goal for a pay period. Immediate + active; no drafts."""
    stylist_id = payload.stylist_id or current.id
    stylist = session.get(User, stylist_id)
    if stylist is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stylist not found")
    # A stylist may only set their own goal; admins/owners may set for anyone.
    if stylist.id != current.id and current.role not in (UserRole.admin, UserRole.owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot set goals for another stylist")

    return goal_service.set_goal(
        session,
        stylist=stylist,
        week_start=payload.week_start,
        target_pph=payload.target_pph,
        target_hours=payload.target_hours,
        target_haircuts=payload.target_haircuts,
        target_colors=payload.target_colors,
    )


@router.get("/active", response_model=GoalRead | None)
def get_active(
    week_start: date,
    stylist_id: int | None = None,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Goal | None:
    stylist = session.get(User, stylist_id or current.id)
    if stylist is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stylist not found")
    if not goal_service.can_view_stylist_goals(current, stylist):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    return goal_service.get_active_goal(session, stylist.id, week_start)


@router.get("/history", response_model=list[GoalRead])
def get_history(
    week_start: date,
    stylist_id: int | None = None,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Goal]:
    stylist = session.get(User, stylist_id or current.id)
    if stylist is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stylist not found")
    if not goal_service.can_view_stylist_goals(current, stylist):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    return goal_service.get_goal_history(session, stylist.id, week_start)


@router.get("/team", response_model=list[TeamGoalRow])
def team_goals(
    week_start: date,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TeamGoalRow]:
    if current.role not in (UserRole.manager, UserRole.admin, UserRole.owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Managers and above only")
    rows = goal_service.get_team_goals(session, current, week_start)
    return [
        TeamGoalRow(
            stylist_id=r["stylist"].id,
            stylist_name=r["stylist"].name,
            active=r["active"],
            previous=r["previous"],
        )
        for r in rows
    ]


@router.post("/{goal_id}/review", response_model=GoalRead)
def review(
    goal_id: int,
    payload: GoalReview,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Goal:
    goal = session.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    stylist = session.get(User, goal.stylist_id)
    if stylist is None or not goal_service.can_review_goal(current, stylist):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to review this goal")
    return goal_service.review_goal(
        session, goal=goal, reviewer=current, status=payload.status, comment=payload.comment
    )


@router.get("/hierarchy", response_model=list[HierarchySalon])
def hierarchy(
    week_start: date,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[HierarchySalon]:
    if current.role not in (UserRole.admin, UserRole.owner):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "SDL / owner / admin only")
    tree = goal_service.get_hierarchy(session, week_start)
    return [
        HierarchySalon(
            salon_id=node["salon"].id,
            salon_name=node["salon"].name,
            managers=[
                HierarchyManager(
                    manager_id=mn["manager"].id,
                    manager_name=mn["manager"].name,
                    stylists=[
                        HierarchyStylist(
                            stylist_id=sn["stylist"].id,
                            stylist_name=sn["stylist"].name,
                            active=sn["active"],
                        )
                        for sn in mn["stylists"]
                    ],
                )
                for mn in node["managers"]
            ],
        )
        for node in tree
    ]


# ── Notifications (recipient = current user) ─────────────────────────────────

notif_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notif_router.get("", response_model=list[NotificationRead])
def list_notifications(
    unread_only: bool = False,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Notification]:
    stmt = select(Notification).where(Notification.recipient_id == current.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)  # noqa: E712
    stmt = stmt.order_by(Notification.created_at.desc())
    return list(session.exec(stmt).all())


@notif_router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Notification:
    n = session.get(Notification, notification_id)
    if n is None or n.recipient_id != current.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.is_read = True
    session.add(n)
    session.commit()
    session.refresh(n)
    return n

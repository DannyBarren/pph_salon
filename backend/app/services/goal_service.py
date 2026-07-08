"""Goal business logic: set/override, history, team aggregation, review.

Kept separate from the HTTP layer so the rules are unit-testable. The two rules
that matter most:

1. **One active goal per (stylist, week_start).** ``set_goal`` deactivates the
   current active goal, links the new one to it (``previous_goal_id``), and the
   superseded rows form the history.
2. **Setting/updating a goal notifies the stylist's direct manager.**
"""

from __future__ import annotations

from datetime import date

from sqlmodel import Session, select

from app.models import Goal, GoalApprovalStatus, Notification, NotificationType, User, UserRole

# ── Visibility helpers ───────────────────────────────────────────────────────


def direct_report_ids(manager: User, session: Session) -> list[int]:
    """Stylist ids a manager *directly* manages (manager_id link)."""
    rows = session.exec(select(User.id).where(User.manager_id == manager.id)).all()
    return list(rows)


def can_view_stylist_goals(viewer: User, stylist: User) -> bool:
    if viewer.role in (UserRole.admin, UserRole.owner):
        return True
    if viewer.id == stylist.id:
        return True
    return viewer.role == UserRole.manager and stylist.manager_id == viewer.id


def can_review_goal(viewer: User, stylist: User) -> bool:
    """Managers review their direct reports; admins/owners review anyone."""
    if viewer.role in (UserRole.admin, UserRole.owner):
        return True
    return viewer.role == UserRole.manager and stylist.manager_id == viewer.id


# ── Reads ────────────────────────────────────────────────────────────────────


def get_active_goal(session: Session, stylist_id: int, week_start: date) -> Goal | None:
    return session.exec(
        select(Goal).where(
            Goal.stylist_id == stylist_id,
            Goal.week_start == week_start,
            Goal.is_active == True,  # noqa: E712 (SQLModel needs ==)
        )
    ).first()


def get_goal_history(session: Session, stylist_id: int, week_start: date) -> list[Goal]:
    """All goals for a (stylist, week), newest first — active + superseded."""
    return list(
        session.exec(
            select(Goal)
            .where(Goal.stylist_id == stylist_id, Goal.week_start == week_start)
            .order_by(Goal.set_at.desc())
        ).all()
    )


# ── Set / override ───────────────────────────────────────────────────────────


def set_goal(
    session: Session,
    *,
    stylist: User,
    week_start: date,
    target_pph: float,
    target_hours: float,
    target_haircuts: int,
    target_colors: int,
    commit: bool = True,
) -> Goal:
    """Create a new active goal, deactivating any existing one for the week.

    Also creates a notification for the stylist's direct manager. Returns the
    new goal.
    """
    previous = get_active_goal(session, stylist.id, week_start)
    is_update = previous is not None
    if previous is not None:
        previous.is_active = False
        session.add(previous)

    goal = Goal(
        stylist_id=stylist.id,
        week_start=week_start,
        target_pph=target_pph,
        target_hours=target_hours,
        target_haircuts=target_haircuts,
        target_colors=target_colors,
        is_active=True,
        previous_goal_id=previous.id if previous else None,
        approval_status=GoalApprovalStatus.pending,
    )
    session.add(goal)
    session.flush()  # assign goal.id before creating the notification

    if stylist.manager_id is not None:
        verb = "updated" if is_update else "set"
        session.add(
            Notification(
                recipient_id=stylist.manager_id,
                actor_id=stylist.id,
                type=NotificationType.goal_updated if is_update else NotificationType.goal_set,
                message=f"Stylist {stylist.name} just {verb} their goal for this pay period.",
                goal_id=goal.id,
            )
        )

    if commit:
        session.commit()
        session.refresh(goal)
    return goal


# ── Review (approve / disapprove) ────────────────────────────────────────────


def review_goal(
    session: Session,
    *,
    goal: Goal,
    reviewer: User,
    status: GoalApprovalStatus,
    comment: str | None,
    commit: bool = True,
) -> Goal:
    """Record a manager's approve/disapprove + comment and notify the stylist."""
    from app.models.base import utcnow

    goal.approval_status = status
    goal.manager_comment = comment
    goal.reviewed_by = reviewer.id
    goal.reviewed_at = utcnow()
    session.add(goal)

    session.add(
        Notification(
            recipient_id=goal.stylist_id,
            actor_id=reviewer.id,
            type=NotificationType.goal_reviewed,
            message=f"{reviewer.name} {status.value} your goal"
            + (f': "{comment}"' if comment else "."),
            goal_id=goal.id,
        )
    )
    if commit:
        session.commit()
        session.refresh(goal)
    return goal


# ── Aggregation ──────────────────────────────────────────────────────────────


def get_team_goals(session: Session, manager: User, week_start: date) -> list[dict]:
    """For each direct report: their active goal + the goal it replaced (if any)."""
    reports = session.exec(select(User).where(User.manager_id == manager.id)).all()
    result: list[dict] = []
    for s in reports:
        active = get_active_goal(session, s.id, week_start)
        previous = session.get(Goal, active.previous_goal_id) if active and active.previous_goal_id else None
        result.append({"stylist": s, "active": active, "previous": previous})
    return result


def get_hierarchy(session: Session, week_start: date) -> list[dict]:
    """Store → Manager → Stylists tree with active goals (SDL/owner drill-down)."""
    from app.models import Salon

    salons = session.exec(select(Salon)).all()
    tree: list[dict] = []
    for salon in salons:
        managers = session.exec(
            select(User).where(User.salon_id == salon.id, User.role == UserRole.manager)
        ).all()
        manager_nodes = []
        for m in managers:
            reports = session.exec(select(User).where(User.manager_id == m.id)).all()
            stylist_nodes = [
                {"stylist": s, "active": get_active_goal(session, s.id, week_start)} for s in reports
            ]
            manager_nodes.append({"manager": m, "stylists": stylist_nodes})
        tree.append({"salon": salon, "managers": manager_nodes})
    return tree

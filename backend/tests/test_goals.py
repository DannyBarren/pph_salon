"""Tests for goal setting, override history, notifications, review, permissions."""

from __future__ import annotations

from datetime import date

import pytest
from app.db.session import get_session
from app.main import app
from app.models import Goal, GoalApprovalStatus, Notification, Salon, User, UserRole
from app.services import goal_service
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

WEEK = date(2026, 6, 29)


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def session(engine):
    with Session(engine) as s:
        yield s


def _seed(session: Session):
    salon = Salon(name="Aria")
    session.add(salon)
    session.commit()
    mgr = User(name="Priya", role=UserRole.manager, salon_id=salon.id)
    session.add(mgr)
    session.commit()
    steph = User(name="Steph", role=UserRole.stylist, salon_id=salon.id, manager_id=mgr.id)
    other = User(name="Other", role=UserRole.stylist, salon_id=salon.id, manager_id=999)
    session.add_all([steph, other])
    session.commit()
    for u in (mgr, steph, other):
        session.refresh(u)
    return salon, mgr, steph, other


def test_set_goal_creates_active_and_notifies_manager(session: Session):
    _, mgr, steph, _ = _seed(session)
    goal = goal_service.set_goal(
        session, stylist=steph, week_start=WEEK,
        target_pph=48, target_hours=28, target_haircuts=20, target_colors=8,
    )
    assert goal.is_active is True
    assert goal.approval_status == GoalApprovalStatus.pending
    notes = session.exec(select(Notification).where(Notification.recipient_id == mgr.id)).all()
    assert len(notes) == 1
    assert "set their goal" in notes[0].message


def test_override_deactivates_previous_and_builds_history(session: Session):
    _, mgr, steph, _ = _seed(session)
    g1 = goal_service.set_goal(
        session, stylist=steph, week_start=WEEK, target_pph=45, target_hours=28,
        target_haircuts=18, target_colors=7,
    )
    g2 = goal_service.set_goal(
        session, stylist=steph, week_start=WEEK, target_pph=50, target_hours=30,
        target_haircuts=22, target_colors=9,
    )
    assert g2.is_active is True
    assert g2.previous_goal_id == g1.id
    refreshed_g1 = session.get(Goal, g1.id)
    assert refreshed_g1.is_active is False  # exactly one active goal per week

    history = goal_service.get_goal_history(session, steph.id, WEEK)
    assert [g.id for g in history] == [g2.id, g1.id]  # newest first
    assert sum(1 for g in history if g.is_active) == 1

    # Second set → "updated" notification (2 total for the manager).
    notes = session.exec(select(Notification).where(Notification.recipient_id == mgr.id)).all()
    assert len(notes) == 2
    assert any("updated their goal" in n.message for n in notes)


def test_review_sets_status_comment_and_notifies_stylist(session: Session):
    _, mgr, steph, _ = _seed(session)
    goal = goal_service.set_goal(
        session, stylist=steph, week_start=WEEK, target_pph=48, target_hours=28,
        target_haircuts=20, target_colors=8,
    )
    reviewed = goal_service.review_goal(
        session, goal=goal, reviewer=mgr, status=GoalApprovalStatus.approved, comment="Great plan!"
    )
    assert reviewed.approval_status == GoalApprovalStatus.approved
    assert reviewed.manager_comment == "Great plan!"
    assert reviewed.reviewed_by == mgr.id
    note = session.exec(select(Notification).where(Notification.recipient_id == steph.id)).first()
    assert note is not None and "approved your goal" in note.message


def test_disapprove_includes_comment_in_notification(session: Session):
    _, mgr, steph, _ = _seed(session)
    goal = goal_service.set_goal(
        session, stylist=steph, week_start=WEEK, target_pph=48, target_hours=28,
        target_haircuts=20, target_colors=8,
    )
    goal_service.review_goal(
        session, goal=goal, reviewer=mgr, status=GoalApprovalStatus.disapproved,
        comment="Bump colors a bit.",
    )
    note = session.exec(
        select(Notification).where(Notification.recipient_id == steph.id).order_by(Notification.id.desc())
    ).first()
    assert note is not None
    assert "disapproved your goal" in note.message
    assert "Bump colors a bit." in note.message


def test_re_review_updates_status_and_notifies_again(session: Session):
    _, mgr, steph, _ = _seed(session)
    goal = goal_service.set_goal(
        session, stylist=steph, week_start=WEEK, target_pph=48, target_hours=28,
        target_haircuts=20, target_colors=8,
    )
    goal_service.review_goal(session, goal=goal, reviewer=mgr, status=GoalApprovalStatus.disapproved, comment="No")
    reviewed = goal_service.review_goal(
        session, goal=goal, reviewer=mgr, status=GoalApprovalStatus.approved, comment="Better!"
    )
    assert reviewed.approval_status == GoalApprovalStatus.approved
    assert reviewed.manager_comment == "Better!"
    # Two review notifications to the stylist (one per review).
    notes = session.exec(select(Notification).where(Notification.recipient_id == steph.id)).all()
    assert len(notes) == 2


def test_permissions_helpers(session: Session):
    _, mgr, steph, other = _seed(session)
    assert goal_service.can_review_goal(mgr, steph) is True  # direct report
    assert goal_service.can_review_goal(mgr, other) is False  # not their report
    assert goal_service.can_view_stylist_goals(steph, steph) is True
    assert goal_service.can_view_stylist_goals(steph, other) is False


# ── Endpoint / HTTP-level tests ──────────────────────────────────────────────


def _client(engine, user_id: int) -> TestClient:
    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    c = TestClient(app)
    c.headers.update({"X-Demo-User-Id": str(user_id)})
    return c


def test_endpoints_flow(engine):
    with Session(engine) as s:
        _, mgr, steph, other = _seed(s)
        mgr_id, steph_id, other_id = mgr.id, steph.id, other.id

    try:
        stylist = _client(engine, steph_id)
        # Stylist sets their goal.
        r = stylist.post("/api/v1/goals", json={
            "week_start": "2026-06-29", "target_pph": 48, "target_hours": 28,
            "target_haircuts": 20, "target_colors": 8,
        })
        assert r.status_code == 201, r.text
        goal_id = r.json()["id"]

        # Stylist cannot set another stylist's goal.
        r = stylist.post("/api/v1/goals", json={
            "week_start": "2026-06-29", "target_pph": 40, "target_hours": 20,
            "target_haircuts": 10, "target_colors": 5, "stylist_id": other_id,
        })
        assert r.status_code == 403

        # Manager sees team goals + reviews.
        mgr_c = _client(engine, mgr_id)
        team = mgr_c.get("/api/v1/goals/team", params={"week_start": "2026-06-29"}).json()
        assert any(row["stylist_id"] == steph_id and row["active"] for row in team)
        rev = mgr_c.post(f"/api/v1/goals/{goal_id}/review", json={"status": "approved", "comment": "ok"})
        assert rev.status_code == 200 and rev.json()["approval_status"] == "approved"

        # Stylist cannot review.
        assert stylist.post(f"/api/v1/goals/{goal_id}/review", json={"status": "approved"}).status_code == 403

        # Stylist got a review notification; can mark it read.
        notes = stylist.get("/api/v1/notifications").json()
        assert len(notes) >= 1
        nid = notes[0]["id"]
        assert stylist.post(f"/api/v1/notifications/{nid}/read").json()["is_read"] is True
    finally:
        app.dependency_overrides.pop(get_session, None)

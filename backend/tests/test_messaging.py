"""Tests for message board visibility, targeting, and acknowledgments."""

from __future__ import annotations

import pytest
from app.db.session import get_session
from app.main import app
from app.models import MessageBoardPost, Salon, User, UserRole
from app.services import messaging
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine


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
    a = Salon(name="Aria")
    b = Salon(name="Lumière")
    session.add_all([a, b])
    session.commit()
    mgr_a = User(name="Mgr A", role=UserRole.manager, salon_id=a.id)
    st_a1 = User(name="Sty A1", role=UserRole.stylist, salon_id=a.id)
    st_a2 = User(name="Sty A2", role=UserRole.stylist, salon_id=a.id)
    st_b1 = User(name="Sty B1", role=UserRole.stylist, salon_id=b.id)
    admin = User(name="Owner", role=UserRole.admin, salon_id=a.id)
    session.add_all([mgr_a, st_a1, st_a2, st_b1, admin])
    session.commit()
    for u in (mgr_a, st_a1, st_a2, st_b1, admin):
        session.refresh(u)
    return {"a": a, "b": b, "mgr_a": mgr_a, "st_a1": st_a1, "st_a2": st_a2, "st_b1": st_b1, "admin": admin}


def test_can_post_permissions(session: Session):
    d = _seed(session)
    assert messaging.can_post(d["mgr_a"]) is True
    assert messaging.can_post(d["admin"]) is True
    assert messaging.can_post(d["st_a1"]) is False


def test_manager_audience_is_scoped_to_own_salon(session: Session):
    d = _seed(session)
    aud, salon_id = messaging.normalize_audience_for_role(d["mgr_a"], {"kind": "all"})
    assert aud == {"kind": "salons", "salonIds": [d["a"].id]}
    assert salon_id == d["a"].id


def test_visibility_by_salon_targeting(session: Session):
    d = _seed(session)
    post = MessageBoardPost(
        author_id=d["mgr_a"].id, author_role=str(UserRole.manager), salon_id=d["a"].id,
        target_audience={"kind": "salons", "salonIds": [d["a"].id]}, title="Salon A only",
    )
    session.add(post)
    session.commit()

    assert messaging.can_view(post, d["st_a1"]) is True  # in salon A
    assert messaging.can_view(post, d["st_b1"]) is False  # salon B stylist
    assert messaging.can_view(post, d["admin"]) is True  # org-wide sees all


def test_targeted_stylists_and_ack_stats(session: Session):
    d = _seed(session)
    post = MessageBoardPost(
        author_id=d["mgr_a"].id, author_role=str(UserRole.manager), salon_id=d["a"].id,
        target_audience={"kind": "salons", "salonIds": [d["a"].id]}, title="Team update",
    )
    session.add(post)
    session.commit()
    session.refresh(post)

    targeted = messaging.targeted_stylist_ids(session, post)
    assert set(targeted) == {d["st_a1"].id, d["st_a2"].id}  # only salon A stylists

    messaging.acknowledge_post(session, post.id, d["st_a1"].id)
    messaging.acknowledge_post(session, post.id, d["st_a1"].id)  # idempotent
    stats = messaging.acknowledgment_stats(session, post)
    assert stats == {"acknowledged": 1, "total": 2, "percent": 50}


def _client_as(engine, user_id: int) -> TestClient:
    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    client = TestClient(app)
    client.headers.update({"X-Demo-User-Id": str(user_id)})
    return client


def test_message_endpoints_end_to_end(engine):
    with Session(engine) as s:
        d = _seed(s)
        mgr_id, st_id, other_salon_st = d["mgr_a"].id, d["st_a1"].id, d["st_b1"].id

    try:
        # Manager creates a post (auto-scoped to their salon).
        mgr = _client_as(engine, mgr_id)
        resp = mgr.post("/api/v1/messages", json={"title": "Hello team", "content": "Big weekend!", "is_pinned": True})
        assert resp.status_code == 201, resp.text
        post = resp.json()
        assert post["target_audience"]["kind"] == "salons"
        post_id = post["id"]

        # Salon-A stylist sees it and can acknowledge.
        st = _client_as(engine, st_id)
        listing = st.get("/api/v1/messages").json()
        assert any(p["id"] == post_id for p in listing)
        ack = st.post(f"/api/v1/messages/{post_id}/acknowledge")
        assert ack.status_code == 200

        # Salon-B stylist should NOT see it.
        other = _client_as(engine, other_salon_st)
        assert all(p["id"] != post_id for p in other.get("/api/v1/messages").json())

        # Stylist cannot post.
        assert st.post("/api/v1/messages", json={"title": "nope"}).status_code == 403

        # Sender sees acknowledgment stats.
        detail = mgr.get(f"/api/v1/messages/{post_id}/acknowledgments").json()
        assert detail["stats"]["acknowledged"] == 1
        assert detail["stats"]["total"] == 2
    finally:
        app.dependency_overrides.pop(get_session, None)

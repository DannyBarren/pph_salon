"""Account 'unlock / send setup link' invite flow + username login."""

from __future__ import annotations

import pytest
from app.core import security
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

PP = "/api/v1"


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture()
def client(engine):
    def _get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def _seed(engine):
    with Session(engine) as s:
        s.add(Salon(id=1, name="Aria Studio"))
        s.add(Salon(id=2, name="Lumiere"))
        s.commit()
        owner = User(name="Owner", role=UserRole.owner, salon_id=1, email="owner@x.com")
        mgr = User(name="Mgr", role=UserRole.manager, salon_id=1, email="mgr@x.com")
        # Pending stylists (imported, no password/email yet or email-only).
        s1 = User(name="Reb", role=UserRole.stylist, salon_id=1, manager_id=None, email="reb@x.com")
        s1_noemail = User(name="No Email", role=UserRole.stylist, salon_id=1)
        other = User(name="Other", role=UserRole.stylist, salon_id=2, email="o@x.com")
        for u in (owner, mgr, s1, s1_noemail, other):
            s.add(u)
        s.commit()
        for u in (owner, mgr, s1, s1_noemail, other):
            s.refresh(u)
        return {"owner": owner.id, "mgr": mgr.id, "reb": s1.id, "noemail": s1_noemail.id, "other": other.id}


def _as(uid: int) -> dict[str, str]:
    return {"X-Demo-User-Id": str(uid)}


def _token_from(link: str) -> str:
    return link.split("token=")[1]


def test_admin_invite_then_accept_then_login(client, engine):
    ids = _seed(engine)
    # Admin unlocks (invites) a pending stylist.
    r = client.post(f"{PP}/users/{ids['reb']}/invite", json={}, headers=_as(ids["owner"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "reb@x.com"
    assert body["setup_link"]  # email not configured in tests → link returned

    token = _token_from(body["setup_link"])

    # Public preview shows who it's for.
    pv = client.get(f"{PP}/auth/invite/{token}")
    assert pv.status_code == 200 and pv.json()["valid"] is True
    assert pv.json()["name"] == "Reb"

    # Accept: choose a password → signed in (token pair returned).
    acc = client.post(f"{PP}/auth/accept-invite", json={"token": token, "new_password": "s3cretpw!"})
    assert acc.status_code == 200, acc.text
    assert acc.json()["access_token"]

    # The one-time token is now invalid.
    assert client.get(f"{PP}/auth/invite/{token}").json()["valid"] is False

    # And the user can log in with email + chosen password.
    login = client.post(f"{PP}/auth/login", json={"email": "reb@x.com", "password": "s3cretpw!"})
    assert login.status_code == 200, login.text


def test_accept_invite_rejects_bad_token(client, engine):
    _seed(engine)
    r = client.post(f"{PP}/auth/accept-invite", json={"token": "nope", "new_password": "s3cretpw!"})
    assert r.status_code == 400


def test_accept_invite_enforces_password_policy(client, engine):
    ids = _seed(engine)
    link = client.post(f"{PP}/users/{ids['reb']}/invite", json={}, headers=_as(ids["owner"])).json()["setup_link"]
    r = client.post(f"{PP}/auth/accept-invite", json={"token": _token_from(link), "new_password": "short"})
    assert r.status_code == 400


def test_manager_can_invite_own_stylist_not_other_salon(client, engine):
    ids = _seed(engine)
    ok = client.post(f"{PP}/users/{ids['reb']}/invite", json={}, headers=_as(ids["mgr"]))
    assert ok.status_code == 200, ok.text
    denied = client.post(f"{PP}/users/{ids['other']}/invite", json={}, headers=_as(ids["mgr"]))
    assert denied.status_code == 403


def test_invite_requires_email_or_sets_it(client, engine):
    ids = _seed(engine)
    # No email on the account and none supplied → 400.
    r = client.post(f"{PP}/users/{ids['noemail']}/invite", json={}, headers=_as(ids["owner"]))
    assert r.status_code == 400
    # Supplying an email sets it and succeeds.
    r2 = client.post(
        f"{PP}/users/{ids['noemail']}/invite",
        json={"email": "newhire@x.com"},
        headers=_as(ids["owner"]),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["email"] == "newhire@x.com"


def test_username_login_for_admin(client, engine):
    # Admin whose login identifier is a username (not an email).
    with Session(engine) as s:
        s.add(Salon(id=1, name="HQ"))
        s.commit()
        s.add(User(
            name="Venita", role=UserRole.owner, salon_id=1, email="Venita_Admin",
            hashed_password=security.hash_password("Salon_Admin"), is_active=True,
        ))
        s.commit()
    r = client.post(f"{PP}/auth/login", json={"email": "Venita_Admin", "password": "Salon_Admin"})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


def test_seeded_employees_cannot_login_until_setup(client, engine):
    ids = _seed(engine)
    # Pending stylist has no password → login refused.
    r = client.post(f"{PP}/auth/login", json={"email": "reb@x.com", "password": "whatever1"})
    assert r.status_code == 401
    assert ids["reb"]

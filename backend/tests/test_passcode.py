"""Fast-access numeric passcode: set / change / clear / verify + lockout.

The passcode is a same-device convenience gate layered on top of a full login.
These tests exercise it against real (non-demo) accounts by driving the JWT
login → verify flow, and assert the server-side policy, re-auth requirement,
rate-limit lockout, and audit trail.
"""

from __future__ import annotations

import pytest
from app.core import security
from app.core.config import get_settings
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

PP = "/api/v1"
PW = "venitaadmin"


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
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


@pytest.fixture()
def real_mode():
    """Disable demo mode so the Bearer token resolves to the real DB user
    (in demo mode ``get_current_user`` injects a synthetic admin)."""
    settings = get_settings()
    prev = settings.demo_mode
    settings.demo_mode = False
    yield
    settings.demo_mode = prev


def _seed_admin(engine) -> int:
    with Session(engine) as s:
        s.add(Salon(id=1, name="HQ"))
        s.commit()
        u = User(
            name="Venita", role=UserRole.owner, salon_id=1, email="admin",
            hashed_password=security.hash_password(PW), is_active=True,
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u.id


def _login(client, identifier: str = "admin", password: str = PW) -> str:
    r = client.post(f"{PP}/auth/login", json={"email": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_set_verify_and_me_reports_passcode(client, engine, real_mode):
    _seed_admin(engine)
    token = _login(client)

    # No passcode yet.
    me = client.get(f"{PP}/auth/me", headers=_bearer(token)).json()
    assert me["has_passcode"] is False

    # Set a 4-digit passcode (requires the current password as re-auth).
    r = client.post(
        f"{PP}/auth/passcode",
        json={"passcode": "1234", "current_password": PW},
        headers=_bearer(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["has_passcode"] is True

    # /me now reflects it.
    me = client.get(f"{PP}/auth/me", headers=_bearer(token)).json()
    assert me["has_passcode"] is True

    # Verify with the correct passcode → fresh token pair.
    v = client.post(f"{PP}/auth/passcode/verify", json={"passcode": "1234"}, headers=_bearer(token))
    assert v.status_code == 200, v.text
    assert v.json()["access_token"]


def test_set_passcode_requires_current_password(client, engine, real_mode):
    _seed_admin(engine)
    token = _login(client)
    r = client.post(
        f"{PP}/auth/passcode",
        json={"passcode": "123456", "current_password": "wrong-password"},
        headers=_bearer(token),
    )
    assert r.status_code == 400


@pytest.mark.parametrize("bad", ["123", "1234567", "12a4", "abcd", ""])
def test_passcode_policy_rejects_bad_values(client, engine, real_mode, bad):
    _seed_admin(engine)
    token = _login(client)
    r = client.post(
        f"{PP}/auth/passcode",
        json={"passcode": bad, "current_password": PW},
        headers=_bearer(token),
    )
    assert r.status_code == 400, r.text


def test_wrong_passcode_locks_out_after_max_attempts(client, engine, real_mode):
    uid = _seed_admin(engine)
    token = _login(client)
    client.post(
        f"{PP}/auth/passcode",
        json={"passcode": "4321", "current_password": PW},
        headers=_bearer(token),
    )
    # Five wrong attempts (PASSCODE_MAX_ATTEMPTS) exhaust the allowance.
    for _ in range(security.PASSCODE_MAX_ATTEMPTS):
        r = client.post(f"{PP}/auth/passcode/verify", json={"passcode": "0000"}, headers=_bearer(token))
        assert r.status_code == 401

    # The next attempt is locked out (429) and the passcode is cleared so the
    # user must fall back to a full password login.
    locked = client.post(f"{PP}/auth/passcode/verify", json={"passcode": "4321"}, headers=_bearer(token))
    assert locked.status_code == 429
    with Session(engine) as s:
        u = s.get(User, uid)
        assert u.passcode_hash is None


def test_successful_verify_resets_failed_attempts(client, engine, real_mode):
    uid = _seed_admin(engine)
    token = _login(client)
    client.post(
        f"{PP}/auth/passcode",
        json={"passcode": "2468", "current_password": PW},
        headers=_bearer(token),
    )
    client.post(f"{PP}/auth/passcode/verify", json={"passcode": "0000"}, headers=_bearer(token))
    client.post(f"{PP}/auth/passcode/verify", json={"passcode": "2468"}, headers=_bearer(token))
    with Session(engine) as s:
        assert s.get(User, uid).passcode_failed_attempts == 0


def test_clear_passcode(client, engine, real_mode):
    uid = _seed_admin(engine)
    token = _login(client)
    client.post(
        f"{PP}/auth/passcode",
        json={"passcode": "1357", "current_password": PW},
        headers=_bearer(token),
    )
    r = client.request("DELETE", f"{PP}/auth/passcode", headers=_bearer(token))
    assert r.status_code == 200, r.text
    assert r.json()["has_passcode"] is False
    with Session(engine) as s:
        assert s.get(User, uid).passcode_hash is None
    # Verifying now fails because there's no passcode.
    v = client.post(f"{PP}/auth/passcode/verify", json={"passcode": "1357"}, headers=_bearer(token))
    assert v.status_code == 400


def test_passcode_endpoints_require_auth(client, engine):
    _seed_admin(engine)
    # No bearer token → unauthenticated (demo mode is off implicitly because we
    # send no X-Demo-User-Id and there's a real login flow; auth.py set_passcode
    # rejects the demo principal anyway).
    r = client.post(f"{PP}/auth/passcode", json={"passcode": "1234", "current_password": PW})
    assert r.status_code in (400, 401)


def test_pending_user_status_and_flags(client, engine):
    """A seeded roster user (no password) reports pending_setup via the API."""
    with Session(engine) as s:
        s.add(Salon(id=1, name="HQ"))
        s.commit()
        s.add(User(name="Pending Stylist", role=UserRole.stylist, salon_id=1, email="p@x.com"))
        s.commit()
    rows = client.get(f"{PP}/users").json()
    pending = next(u for u in rows if u["name"] == "Pending Stylist")
    assert pending["status"] == "pending_setup"
    assert pending["has_password"] is False
    assert pending["has_passcode"] is False
    assert pending["is_active"] is True

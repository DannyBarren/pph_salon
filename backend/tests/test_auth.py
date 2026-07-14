"""Auth + RBAC + demo-mode tests."""

from __future__ import annotations

import jwt
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


# ----------------------------- fixtures -----------------------------
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
    """Temporarily disable demo mode to exercise real JWT + role checks."""
    settings = get_settings()
    prev = settings.demo_mode
    settings.demo_mode = False
    yield
    settings.demo_mode = prev


def seed(engine, *, role=UserRole.admin, email="admin@pph.com", password="pw", manager_id=None):
    with Session(engine) as s:
        salon = s.get(Salon, 1) or Salon(id=1, name="Aria")
        s.add(salon)
        s.commit()
        user = User(
            name=email.split("@")[0],
            email=email,
            role=role,
            salon_id=1,
            manager_id=manager_id,
            hashed_password=security.hash_password(password),
        )
        s.add(user)
        s.commit()
        s.refresh(user)
        return user.id


# ----------------------------- security unit -----------------------------
def test_password_hash_roundtrip():
    h = security.hash_password("s3cret")
    assert h != "s3cret"
    assert security.verify_password("s3cret", h)
    assert not security.verify_password("wrong", h)


def test_token_create_and_decode():
    access = security.create_access_token(42, role="admin")
    payload = security.decode_token(access, expected_type="access")
    assert payload["sub"] == "42"
    assert payload["role"] == "admin"
    # wrong expected type is rejected
    with pytest.raises(jwt.InvalidTokenError):
        security.decode_token(access, expected_type="refresh")


# ----------------------------- demo mode -----------------------------
def test_demo_mode_me_injects_admin(client):
    r = client.get(f"{PP}/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "admin"
    assert body["is_demo"] is True


def test_demo_mode_protected_endpoint_without_token(client):
    r = client.post(f"{PP}/payplan/effective-rate", json={"production": 1000, "hours": 8})
    assert r.status_code == 200  # bypassed by demo mode
    assert r.json()["pay"] == 420.0


def test_demo_mode_act_as_user_and_visibility(client, engine):
    mgr = seed(engine, role=UserRole.manager, email="mgr@pph.com")
    with Session(engine) as s:
        st = User(name="Maya", role=UserRole.stylist, salon_id=1, manager_id=mgr)
        s.add(st)
        s.commit()
        s.refresh(st)
        stylist_id = st.id

    # Act as the manager via header — no login required in demo mode.
    me = client.get(f"{PP}/auth/me", headers={"X-Demo-User-Id": str(mgr)})
    assert me.json()["role"] == "manager"

    vis = client.get(f"{PP}/users/visible-stylists", headers={"X-Demo-User-Id": str(mgr)})
    assert vis.status_code == 200
    assert [u["id"] for u in vis.json()] == [stylist_id]


# ----------------------------- real mode -----------------------------
def test_real_mode_requires_token(client, real_mode):
    r = client.post(f"{PP}/payplan/effective-rate", json={"production": 1000, "hours": 8})
    assert r.status_code == 401


def test_real_mode_login_me_and_refresh(client, engine, real_mode):
    seed(engine, role=UserRole.admin, email="admin@pph.com", password="pw")
    # login
    r = client.post(f"{PP}/auth/login", json={"email": "admin@pph.com", "password": "pw"})
    assert r.status_code == 200
    tokens = r.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    me = client.get(f"{PP}/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "admin@pph.com"
    assert me.json()["is_demo"] is False

    # protected calc now works with the token
    calc = client.post(
        f"{PP}/payplan/effective-rate", json={"production": 1000, "hours": 8}, headers=headers
    )
    assert calc.status_code == 200

    # refresh issues a new access token
    rf = client.post(f"{PP}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert rf.status_code == 200
    assert rf.json()["access_token"]

    # bad login rejected
    bad = client.post(f"{PP}/auth/login", json={"email": "admin@pph.com", "password": "nope"})
    assert bad.status_code == 401


def test_real_mode_invite_only_register_rbac(client, engine, real_mode):
    seed(engine, role=UserRole.admin, email="admin@pph.com", password="pw")
    admin_tokens = client.post(
        f"{PP}/auth/login", json={"email": "admin@pph.com", "password": "pw"}
    ).json()
    admin_h = {"Authorization": f"Bearer {admin_tokens['access_token']}"}

    # admin can register a stylist (password must meet the policy: >=8 chars)
    reg = client.post(
        f"{PP}/auth/register",
        json={
            "email": "maya@pph.com",
            "password": "pw2secure",
            "name": "Maya",
            "role": "stylist",
            "salon_id": 1,
        },
        headers=admin_h,
    )
    assert reg.status_code == 201

    # the new stylist can log in but CANNOT register others (403)
    stylist_tokens = client.post(
        f"{PP}/auth/login", json={"email": "maya@pph.com", "password": "pw2secure"}
    ).json()
    stylist_h = {"Authorization": f"Bearer {stylist_tokens['access_token']}"}
    forbidden = client.post(
        f"{PP}/auth/register",
        json={"email": "x@pph.com", "password": "p", "name": "X", "role": "stylist", "salon_id": 1},
        headers=stylist_h,
    )
    assert forbidden.status_code == 403

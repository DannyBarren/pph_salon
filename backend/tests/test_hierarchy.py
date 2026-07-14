"""Delegated, hierarchical account provisioning + first-run bootstrap tests.

Demo mode lets us "act as" a real user via the ``X-Demo-User-Id`` header, which
is how we exercise manager-level permissions without minting JWTs.
"""

from __future__ import annotations

import io

import pytest
from app.core.config import get_settings
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

PP = "/api/v1"


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


def _seed(engine):
    """Two salons, an owner, a manager in salon 1, and a stylist in salon 2."""
    with Session(engine) as s:
        s.add(Salon(id=1, name="Aria Studio"))
        s.add(Salon(id=2, name="Lumiere"))
        s.commit()
        owner = User(name="Owner", role=UserRole.owner, salon_id=1, email="owner@x.com")
        mgr = User(name="Mgr", role=UserRole.manager, salon_id=1, email="mgr@x.com")
        other = User(name="Other Stylist", role=UserRole.stylist, salon_id=2, email="o@x.com")
        s.add(owner)
        s.add(mgr)
        s.add(other)
        s.commit()
        s.refresh(mgr)
        s.refresh(owner)
        s.refresh(other)
        return {"owner": owner.id, "mgr": mgr.id, "other": other.id}


def _as(uid: int) -> dict[str, str]:
    return {"X-Demo-User-Id": str(uid)}


def test_manager_creates_stylist_in_own_salon_as_report(client, engine):
    ids = _seed(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "Reb", "role": "stylist", "salon_id": 99, "email": "reb@x.com"},
        headers=_as(ids["mgr"]),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    # Salon is forced to the manager's salon; manager becomes the report's manager.
    assert body["salon_id"] == 1
    assert body["manager_id"] == ids["mgr"]
    assert body["role"] == "stylist"


def test_manager_cannot_create_manager(client, engine):
    ids = _seed(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "New Mgr", "role": "manager", "salon_id": 1, "email": "nm@x.com"},
        headers=_as(ids["mgr"]),
    )
    assert r.status_code == 403


def test_stylist_cannot_provision(client, engine):
    _seed(engine)
    # A stylist (leaf level) cannot create anyone.
    with Session(engine) as s:
        st = User(name="Leaf", role=UserRole.stylist, salon_id=1, email="leaf@x.com")
        s.add(st)
        s.commit()
        s.refresh(st)
        leaf_id = st.id
    r = client.post(
        f"{PP}/users",
        json={"name": "X", "role": "stylist", "salon_id": 1, "email": "x@x.com"},
        headers=_as(leaf_id),
    )
    assert r.status_code == 403


def test_owner_creates_manager_any_salon(client, engine):
    ids = _seed(engine)
    r = client.post(
        f"{PP}/users",
        json={"name": "GM2", "role": "manager", "salon_id": 2, "email": "gm2@x.com"},
        headers=_as(ids["owner"]),
    )
    assert r.status_code == 201, r.text
    assert r.json()["salon_id"] == 2


def test_manager_cannot_manage_other_salon_user(client, engine):
    ids = _seed(engine)
    # Manager (salon 1) cannot deactivate a stylist in salon 2.
    r = client.post(f"{PP}/users/{ids['other']}/deactivate", headers=_as(ids["mgr"]))
    assert r.status_code == 403


def test_manager_deactivates_own_report(client, engine):
    ids = _seed(engine)
    created = client.post(
        f"{PP}/users",
        json={"name": "Reb", "role": "stylist", "salon_id": 1, "email": "reb2@x.com"},
        headers=_as(ids["mgr"]),
    ).json()
    r = client.post(f"{PP}/users/{created['id']}/deactivate", headers=_as(ids["mgr"]))
    assert r.status_code == 200
    assert r.json()["role"] == "stylist"


def test_manager_bulk_import_scoped_to_own_salon_stylists(client, engine):
    ids = _seed(engine)
    csv_text = (
        "email,name,role,salon_name\n"
        "s1@x.com,Stylist One,stylist,Lumiere\n"   # other salon → forced to salon 1
        "s2@x.com,Stylist Two,stylist,Aria Studio\n"
        "boss@x.com,Sneaky,manager,Aria Studio\n"  # manager role → skipped
    )
    files = {"file": ("u.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-users", files=files, headers=_as(ids["mgr"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 2
    assert body["skipped"] == 1
    with Session(engine) as s:
        for email in ("s1@x.com", "s2@x.com"):
            u = s.exec(select(User).where(User.email == email)).first()
            assert u.salon_id == 1  # confined to the manager's salon
            assert u.manager_id == ids["mgr"]  # auto-assigned as the report's manager


# ── First-run bootstrap ────────────────────────────────────────────────────────
@pytest.fixture()
def bootstrap_token():
    settings = get_settings()
    prev = settings.bootstrap_token
    settings.bootstrap_token = "super-secret-token"
    yield "super-secret-token"
    settings.bootstrap_token = prev


def _boot_body(token: str) -> dict:
    return {
        "token": token,
        "email": "founder@x.com",
        "password": "a-strong-password",
        "name": "Founder",
        "salon_name": "HQ Salon",
    }


def test_bootstrap_disabled_without_token(client):
    # No bootstrap_token configured → endpoint disabled.
    r = client.post(f"{PP}/auth/bootstrap", json=_boot_body("anything"))
    assert r.status_code == 403


def test_bootstrap_rejects_bad_token(client, bootstrap_token):
    r = client.post(f"{PP}/auth/bootstrap", json=_boot_body("wrong-token"))
    assert r.status_code == 403


def test_bootstrap_creates_first_owner_then_is_one_time(client, engine, bootstrap_token):
    r = client.post(f"{PP}/auth/bootstrap", json=_boot_body(bootstrap_token))
    assert r.status_code == 201, r.text
    tokens = r.json()
    assert tokens["access_token"] and tokens["refresh_token"]
    with Session(engine) as s:
        owner = s.exec(select(User).where(User.email == "founder@x.com")).first()
        assert owner is not None and owner.role == UserRole.owner

    # Second call is rejected — cannot be reused as a backdoor.
    again = client.post(f"{PP}/auth/bootstrap", json=_boot_body(bootstrap_token))
    assert again.status_code == 409

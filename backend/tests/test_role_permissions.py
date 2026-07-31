"""Tests for the new role hierarchy, admin-only guards, and Excluded flag.

Hierarchy (highest → lowest): Admin > SDL/Owner > Manager > Stylist.
Editing / import / configuration / payment-logic are EXCLUSIVE to Admin.
"""

from __future__ import annotations

import io

import pytest
from app.db.session import get_session
from app.main import app
from app.models import Salon, User, UserRole
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

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


def _make_user(engine, role: UserRole, *, excluded: bool = False) -> int:
    with Session(engine) as s:
        salon = Salon(name=f"Salon {role}")
        s.add(salon)
        s.commit()
        s.refresh(salon)
        u = User(name=f"{role} user", role=role, salon_id=salon.id, excluded=excluded)
        s.add(u)
        s.commit()
        s.refresh(u)
        return u.id


def _as(uid: int) -> dict[str, str]:
    return {"X-Demo-User-Id": str(uid)}


def test_owner_sdl_blocked_from_admin_capabilities(client, engine):
    owner = _make_user(engine, UserRole.owner)
    # Payment-logic (Danger Zone) — admin only.
    assert client.get(f"{PP}/payment-logic", headers=_as(owner)).status_code == 403
    # Creating a salon — admin only.
    assert client.post(f"{PP}/salons", json={"name": "X"}, headers=_as(owner)).status_code == 403
    # Audit log — admin only.
    assert client.get(f"{PP}/admin/audit", headers=_as(owner)).status_code == 403


def test_owner_sdl_can_provision_subordinate_accounts(client, engine):
    """SDL/Owner is a super-admin for delegated provisioning: they may create,
    invite, and manage subordinate accounts (below their rank) in any salon,
    even though the org-wide Danger Zone (payment logic / salon creation /
    audit) stays exclusive to the top Admin role."""
    owner = _make_user(engine, UserRole.owner)
    r = client.post(
        f"{PP}/users",
        json={"name": "New", "role": "stylist", "salon_id": 1},
        headers=_as(owner),
    )
    assert r.status_code == 201, r.text


def test_manager_and_stylist_blocked_from_admin_capabilities(client, engine):
    manager = _make_user(engine, UserRole.manager)
    stylist = _make_user(engine, UserRole.stylist)
    for uid in (manager, stylist):
        assert client.get(f"{PP}/payment-logic", headers=_as(uid)).status_code == 403
        assert client.post(f"{PP}/salons", json={"name": "Y"}, headers=_as(uid)).status_code == 403


def test_admin_allowed_full_access(client, engine):
    admin = _make_user(engine, UserRole.admin)
    assert client.get(f"{PP}/payment-logic", headers=_as(admin)).status_code == 200
    assert client.post(f"{PP}/salons", json={"name": "Aria"}, headers=_as(admin)).status_code == 201


def test_owner_and_manager_can_still_view_team(client, engine):
    """SDL/Owner and Manager keep read access to their team's data."""
    owner = _make_user(engine, UserRole.owner)
    # visible-stylists is a view endpoint (not admin-gated).
    assert client.get(f"{PP}/users/visible-stylists", headers=_as(owner)).status_code == 200
    assert client.get(f"{PP}/salons", headers=_as(owner)).status_code == 200


def test_client_import_respects_excluded_column(client, engine):
    csv_text = (
        "Salon,Salon Name,Employee code,Employee Name,Position,Excl?,"
        "Guaranteed Pay-Rate,Scheduled hours,Hours worked,Net service Rev,Avg Haircut,Avg Color\n"
        "11016-Burleson,Burleson TX,VG1,Holliean Miller,Stylist,N,10,21,20,735,23,85\n"
        "11016-Burleson,Burleson TX,VG2,Team Lead,Manager,Y,0,40,40,0,23,85\n"
    )
    files = {"file": ("client.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-client?week_start=2026-07-20", files=files)
    assert r.status_code == 200, r.text

    with Session(engine) as s:
        from sqlmodel import select

        holliean = s.exec(select(User).where(User.name == "Holliean Miller")).first()
        lead = s.exec(select(User).where(User.name == "Team Lead")).first()
        assert holliean is not None and holliean.excluded is False
        assert lead is not None and lead.excluded is True


def test_client_template_includes_excl_column(client):
    body = client.get(f"{PP}/admin/import-client-template").text
    assert "Excl?" in body.splitlines()[0]

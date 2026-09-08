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


# ── Password reset (delegated) + self change ────────────────────────────────────
def test_manager_can_reset_own_report_password_but_not_others(client, engine):
    ids = _seed(engine)
    reb = client.post(
        f"{PP}/users",
        json={"name": "Reb", "role": "stylist", "salon_id": 1, "email": "reb3@x.com"},
        headers=_as(ids["mgr"]),
    ).json()
    # Manager resets their own report → gets a fresh temp password back.
    r = client.post(f"{PP}/users/{reb['id']}/reset-password", headers=_as(ids["mgr"]))
    assert r.status_code == 200, r.text
    assert r.json()["temporary_password"]
    # Manager cannot reset a stylist in another salon.
    bad = client.post(f"{PP}/users/{ids['other']}/reset-password", headers=_as(ids["mgr"]))
    assert bad.status_code == 403


def test_self_change_password_flow(client, engine):
    """End-to-end in real mode: login with temp password, then change it."""
    settings = get_settings()
    with Session(engine) as s:
        s.add(Salon(id=1, name="Aria"))
        s.commit()
        from app.core import security
        u = User(name="Reb", role=UserRole.stylist, salon_id=1, email="reb@x.com",
                 hashed_password=security.hash_password("temp-pass-1"))
        s.add(u)
        s.commit()
    prev = settings.demo_mode
    settings.demo_mode = False
    try:
        tok = client.post(f"{PP}/auth/login", json={"email": "reb@x.com", "password": "temp-pass-1"}).json()
        h = {"Authorization": f"Bearer {tok['access_token']}"}
        # wrong current password rejected
        bad = client.post(f"{PP}/auth/change-password",
                          json={"current_password": "nope", "new_password": "brand-new-pass"}, headers=h)
        assert bad.status_code == 400
        # correct change succeeds
        ok = client.post(f"{PP}/auth/change-password",
                         json={"current_password": "temp-pass-1", "new_password": "brand-new-pass"}, headers=h)
        assert ok.status_code == 204
        # old password no longer works, new one does
        assert client.post(f"{PP}/auth/login", json={"email": "reb@x.com", "password": "temp-pass-1"}).status_code == 401
        assert client.post(f"{PP}/auth/login", json={"email": "reb@x.com", "password": "brand-new-pass"}).status_code == 200
    finally:
        settings.demo_mode = prev


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


def test_bootstrap_creates_first_admin_then_is_one_time(client, engine, bootstrap_token):
    r = client.post(f"{PP}/auth/bootstrap", json=_boot_body(bootstrap_token))
    assert r.status_code == 201, r.text
    tokens = r.json()
    assert tokens["access_token"] and tokens["refresh_token"]
    with Session(engine) as s:
        admin = s.exec(select(User).where(User.email == "founder@x.com")).first()
        # The first account must be the top role — an owner would be locked
        # out of every admin capability (import, salons, users, pay config).
        assert admin is not None and admin.role == UserRole.admin

    # Second call is rejected — cannot be reused as a backdoor.
    again = client.post(f"{PP}/auth/bootstrap", json=_boot_body(bootstrap_token))
    assert again.status_code == 409


# ── Locked PPH visibility rules (2026-09-04) ─────────────────────────────────
# Admin sees everyone (incl. off-PPH + orphans). Owner/manager see only on-PPH
# members of their manager_id reporting tree (may span salons). Off-PPH people
# are hidden from non-admins everywhere. Orphans are Admin-only. Only Admin may
# PATCH excluded or reassign manager_id.


def _seed_tree(engine):
    """Two managers sharing salon 1 (each with one on-PPH stylist), an owner
    whose tree spans two salons, a second owner with a separate tree, an admin,
    an off-PPH stylist under manager A, and an orphan stylist.

        ownerA ── mgrA (salon 1) ── styA (salon 1, on-PPH)
                │                └─ styOff (salon 1, OFF-PPH)
                └─ mgrB (salon 2) ── styB (salon 2, on-PPH)
        ownerB ── mgrC (salon 1) ── styC (salon 1, on-PPH)
        orphan (salon 1, no manager)
    """
    with Session(engine) as s:
        s.add(Salon(id=1, name="Aria Studio"))
        s.add(Salon(id=2, name="Lumiere"))
        s.commit()
        admin = User(name="Admin", role=UserRole.admin, salon_id=1, email="admin@x.com")
        owner_a = User(name="OwnerA", role=UserRole.owner, salon_id=1, email="oa@x.com")
        owner_b = User(name="OwnerB", role=UserRole.owner, salon_id=1, email="ob@x.com")
        s.add_all([admin, owner_a, owner_b])
        s.commit()
        for u in (admin, owner_a, owner_b):
            s.refresh(u)

        mgr_a = User(name="MgrA", role=UserRole.manager, salon_id=1, email="ma@x.com",
                     manager_id=owner_a.id)
        mgr_b = User(name="MgrB", role=UserRole.manager, salon_id=2, email="mb@x.com",
                     manager_id=owner_a.id)
        mgr_c = User(name="MgrC", role=UserRole.manager, salon_id=1, email="mc@x.com",
                     manager_id=owner_b.id)
        s.add_all([mgr_a, mgr_b, mgr_c])
        s.commit()
        for u in (mgr_a, mgr_b, mgr_c):
            s.refresh(u)

        sty_a = User(name="StyA", role=UserRole.stylist, salon_id=1, email="sa@x.com",
                     manager_id=mgr_a.id)
        sty_off = User(name="StyOff", role=UserRole.stylist, salon_id=1, email="soff@x.com",
                       manager_id=mgr_a.id, excluded=True)
        sty_b = User(name="StyB", role=UserRole.stylist, salon_id=2, email="sb@x.com",
                     manager_id=mgr_b.id)
        sty_c = User(name="StyC", role=UserRole.stylist, salon_id=1, email="sc@x.com",
                     manager_id=mgr_c.id)
        orphan = User(name="Orphan", role=UserRole.stylist, salon_id=1, email="or@x.com")
        s.add_all([sty_a, sty_off, sty_b, sty_c, orphan])
        s.commit()
        for u in (sty_a, sty_off, sty_b, sty_c, orphan):
            s.refresh(u)
        return {
            "admin": admin.id, "owner_a": owner_a.id, "owner_b": owner_b.id,
            "mgr_a": mgr_a.id, "mgr_b": mgr_b.id, "mgr_c": mgr_c.id,
            "sty_a": sty_a.id, "sty_off": sty_off.id, "sty_b": sty_b.id,
            "sty_c": sty_c.id, "orphan": orphan.id,
        }


def _vis(client, uid: int) -> set[int]:
    r = client.get(f"{PP}/users", headers=_as(uid))
    assert r.status_code == 200, r.text
    return {u["id"] for u in r.json()}


def _vis_stylists(client, uid: int) -> set[int]:
    r = client.get(f"{PP}/users/visible-stylists", headers=_as(uid))
    assert r.status_code == 200, r.text
    return {u["id"] for u in r.json()}


def _team_week_ids(client, uid: int) -> set[int]:
    r = client.get(f"{PP}/performance/team-week", headers=_as(uid))
    assert r.status_code == 200, r.text
    return {rec["stylist_id"] for rec in r.json()["records"]}


def test_peer_managers_same_salon_see_only_their_own_reports(client, engine):
    ids = _seed_tree(engine)
    # Each manager's lists + team-week contain ONLY their own stylist — never
    # the peer manager's stylist, even though they share a salon.
    assert _vis_stylists(client, ids["mgr_a"]) == {ids["sty_a"]}
    assert _vis_stylists(client, ids["mgr_c"]) == {ids["sty_c"]}
    assert _team_week_ids(client, ids["mgr_a"]) == {ids["sty_a"]}
    assert _team_week_ids(client, ids["mgr_c"]) == {ids["sty_c"]}
    # Fetching the peer's stylist's week is forbidden.
    r = client.get(
        f"{PP}/performance/week?stylist_id={ids['sty_c']}&week_start=2026-06-22",
        headers=_as(ids["mgr_a"]),
    )
    assert r.status_code == 403


def test_owner_tree_spans_salons_and_owners_are_isolated(client, engine):
    ids = _seed_tree(engine)
    # Owner A's tree spans both salons via mgr_a + mgr_b; off-PPH sty_off hidden.
    assert _vis(client, ids["owner_a"]) == {ids["mgr_a"], ids["mgr_b"], ids["sty_a"], ids["sty_b"]}
    # Owner B's separate tree: sty_c only (plus its manager); A's people absent.
    assert _vis(client, ids["owner_b"]) == {ids["mgr_c"], ids["sty_c"]}
    assert ids["owner_b"] not in _vis(client, ids["owner_a"])
    assert ids["sty_c"] not in _vis(client, ids["owner_a"])


def test_off_pph_intermediate_manager_hidden_but_reports_still_visible(client, engine):
    ids = _seed_tree(engine)
    # Admin marks mgr_b (salon 2) off-PPH.
    r = client.patch(
        f"{PP}/users/{ids['mgr_b']}", json={"excluded": True}, headers=_as(ids["admin"])
    )
    assert r.status_code == 200, r.text
    # The off-PPH manager is hidden from the owner AND from a peer manager…
    assert ids["mgr_b"] not in _vis(client, ids["owner_a"])
    assert ids["mgr_b"] not in _vis(client, ids["mgr_a"])
    # …but their on-PPH stylist stays visible through them (the chain is walked
    # through off-PPH intermediates, not pruned).
    assert ids["sty_b"] in _vis(client, ids["owner_a"])
    # Admin still sees the off-PPH manager.
    assert ids["mgr_b"] in _vis(client, ids["admin"])


def test_off_pph_hidden_until_admin_turns_pph_on(client, engine):
    ids = _seed_tree(engine)
    # Off-PPH stylist under mgr_a: hidden from mgr_a and owner_a, visible to admin.
    assert ids["sty_off"] not in _vis(client, ids["mgr_a"])
    assert ids["sty_off"] not in _vis(client, ids["owner_a"])
    assert ids["sty_off"] in _vis(client, ids["admin"])
    assert ids["sty_off"] not in _team_week_ids(client, ids["mgr_a"])
    # Off-PPH stylist can still open their OWN week (drives the notice screen).
    r = client.get(
        f"{PP}/performance/week?week_start=2026-06-22", headers=_as(ids["sty_off"])
    )
    assert r.status_code == 200

    # Admin turns PPH on → the stylist appears on the manager's views.
    r = client.patch(
        f"{PP}/users/{ids['sty_off']}", json={"excluded": False}, headers=_as(ids["admin"])
    )
    assert r.status_code == 200, r.text
    assert ids["sty_off"] in _vis(client, ids["mgr_a"])
    assert ids["sty_off"] in _team_week_ids(client, ids["mgr_a"])


def test_orphan_stylist_is_admin_only_regardless_of_pph(client, engine):
    ids = _seed_tree(engine)
    assert ids["orphan"] in _vis(client, ids["admin"])
    assert ids["orphan"] not in _vis(client, ids["owner_a"])
    assert ids["orphan"] not in _vis(client, ids["mgr_a"])
    # After Admin assigns a manager, the orphan joins that manager's tree.
    r = client.patch(
        f"{PP}/users/{ids['orphan']}", json={"manager_id": ids["mgr_a"]},
        headers=_as(ids["admin"]),
    )
    assert r.status_code == 200, r.text
    assert ids["orphan"] in _vis(client, ids["mgr_a"])
    assert ids["orphan"] in _vis(client, ids["owner_a"])  # via mgr_a → owner_a


def test_only_admin_can_patch_excluded_or_manager(client, engine):
    ids = _seed_tree(engine)
    # Manager cannot flip excluded in either direction, nor reassign manager_id.
    assert client.patch(
        f"{PP}/users/{ids['sty_off']}", json={"excluded": False}, headers=_as(ids["mgr_a"])
    ).status_code == 403
    assert client.patch(
        f"{PP}/users/{ids['sty_a']}", json={"excluded": True}, headers=_as(ids["mgr_a"])
    ).status_code == 403
    assert client.patch(
        f"{PP}/users/{ids['sty_a']}", json={"manager_id": ids["mgr_c"]},
        headers=_as(ids["mgr_a"]),
    ).status_code == 403
    # Owner is blocked too — these powers are Admin-only.
    assert client.patch(
        f"{PP}/users/{ids['sty_off']}", json={"excluded": False}, headers=_as(ids["owner_a"])
    ).status_code == 403
    assert client.patch(
        f"{PP}/users/{ids['sty_a']}", json={"manager_id": ids["mgr_b"]},
        headers=_as(ids["owner_a"]),
    ).status_code == 403
    # No-op restatements from shared edit forms are allowed through.
    assert client.patch(
        f"{PP}/users/{ids['sty_a']}", json={"excluded": False, "manager_id": ids["mgr_a"]},
        headers=_as(ids["mgr_a"]),
    ).status_code == 200


def test_manager_csv_cannot_unexclude_existing_stylist(client, engine):
    ids = _seed_tree(engine)
    csv_text = (
        "email,name,role,excluded\n"
        "soff@x.com,StyOff,stylist,N\n"      # try to turn PPH on → must be ignored
        "new@x.com,New Stylist,stylist,Y\n"  # explicit off-PPH at create → allowed
    )
    files = {"file": ("u.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{PP}/admin/import-users", files=files, headers=_as(ids["mgr_a"]))
    assert r.status_code == 200, r.text
    with Session(engine) as s:
        off = s.exec(select(User).where(User.email == "soff@x.com")).first()
        assert off.excluded is True  # unchanged — only Admin turns PPH on
        new = s.exec(select(User).where(User.email == "new@x.com")).first()
        assert new.excluded is True  # creator explicitly marked them excluded
        assert new.manager_id == ids["mgr_a"]


def test_stylist_cannot_list_anyone_else(client, engine):
    ids = _seed_tree(engine)
    assert _vis(client, ids["sty_a"]) == {ids["sty_a"]}
    assert _vis_stylists(client, ids["sty_a"]) == {ids["sty_a"]}
    assert _team_week_ids(client, ids["sty_a"]) == {ids["sty_a"]}

"""Lightweight role-based access for the MVP.

No passwords yet — a simple user switcher in the sidebar sets the active user in
``st.session_state``. Real auth (OIDC / PayCor SSO) is a documented next step.

Permission model (exactly as specified):
* stylist  → only their own data; default screen = Week Summary.
* manager  → composite Team Dashboard for their salon; can drill in, cannot edit
             stylist production data.
* admin    → full access (edit everything, users, tiers, salon settings).
"""

from __future__ import annotations

import streamlit as st

import data_models as db

ROLE_LABELS = {"stylist": "Stylist", "manager": "Salon Manager", "admin": "Admin / SDL"}
SESSION_KEY = "active_user_id"


def current_user() -> db.User | None:
    uid = st.session_state.get(SESSION_KEY)
    return db.get_user(uid) if uid else None


def set_current_user(user_id: str) -> None:
    st.session_state[SESSION_KEY] = user_id


def is_stylist(user: db.User) -> bool:
    return user.role == "stylist"


def can_view_team(user: db.User) -> bool:
    return user.role in ("manager", "admin")


def can_edit_all(user: db.User) -> bool:
    """Admins can edit any data / config; managers + stylists cannot."""
    return user.role == "admin"


def can_edit_user_data(actor: db.User, target_id: str) -> bool:
    """Stylists edit only their own data; admins edit anyone; managers edit none."""
    if actor.role == "admin":
        return True
    if actor.role == "stylist":
        return actor.id == target_id
    return False  # managers are read-only on stylist production


def visible_stylists(user: db.User) -> list[db.User]:
    """Stylists the user is allowed to see."""
    if user.role == "admin":
        return db.list_users(role="stylist")
    if user.role == "manager":
        return db.get_stylists_by_salon(user.salon_id)
    return [user]  # a stylist sees only themselves


def login_sidebar() -> db.User | None:
    """Render the sidebar user switcher and return the active user."""
    users = db.list_users()
    if not users:
        st.sidebar.error("No users found. Seed data may have failed to load.")
        return None

    # Default to the first stylist so the demo opens on a stylist experience.
    if SESSION_KEY not in st.session_state:
        stylists = [u for u in users if u.role == "stylist"]
        set_current_user((stylists or users)[0].id)

    labels = {u.id: f"{u.name} · {ROLE_LABELS.get(u.role, u.role)}" for u in users}
    ids = list(labels.keys())
    active = st.session_state.get(SESSION_KEY, ids[0])
    idx = ids.index(active) if active in ids else 0

    st.sidebar.markdown("### Signed in as")
    chosen = st.sidebar.selectbox(
        "Switch account (demo)",
        options=ids,
        index=idx,
        format_func=lambda i: labels[i],
        label_visibility="collapsed",
    )
    if chosen != active:
        set_current_user(chosen)
        st.rerun()
    return current_user()

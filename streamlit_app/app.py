"""PPH Stylist App — Streamlit MVP.

Run with:  streamlit run streamlit_app/app.py

Role-based navigation:
* Stylist  → Week Summary (default), Week by Day, Goal Planner, My Data, + extras.
* Manager  → Team Dashboard (default) + read-only drill-in, Goal Planner, extras.
* Admin    → everything, including Data Entry for anyone and Admin config/import.
"""

from __future__ import annotations

import os
import sys

# Ensure sibling modules import cleanly however Streamlit launches the script.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import streamlit as st  # noqa: E402

import auth  # noqa: E402
import data_models as db  # noqa: E402
from screens import (  # noqa: E402
    admin as admin_screen,
    data_entry,
    extras,
    goal_planner,
    team_dashboard,
    week_by_day,
    week_summary,
)
from screens.common import week_label  # noqa: E402
from seed_data import CURRENT_WEEK  # noqa: E402

st.set_page_config(page_title="PPH Stylist App", page_icon="💇", layout="wide")

# Initialize DB + demo seed once.
db.init_db(seed=True)


# ── Navigation available per role ────────────────────────────────────────────
NAV_BY_ROLE = {
    "stylist": ["Week Summary", "Week by Day", "Goal Planner", "My Data", "Calendar", "Promotions", "Notifications"],
    "manager": ["Team Dashboard", "Week Summary", "Week by Day", "Goal Planner", "Calendar", "Promotions", "Notifications"],
    "admin": ["Team Dashboard", "Week Summary", "Week by Day", "Goal Planner", "Data Entry", "Admin", "Calendar", "Promotions", "Notifications"],
}


def week_selector() -> str:
    weeks = db.all_week_starts()
    if CURRENT_WEEK not in weeks:
        weeks = [CURRENT_WEEK, *weeks]
    return st.sidebar.selectbox("Week", weeks, format_func=week_label)


def stylist_selector(viewer: db.User) -> db.User:
    """For managers/admins: pick which stylist the individual screens target."""
    stylists = auth.visible_stylists(viewer)
    names = {s.id: s.name for s in stylists}
    chosen = st.sidebar.selectbox("Stylist", list(names.keys()), format_func=lambda i: names[i])
    return db.get_user(chosen)


def main() -> None:
    st.sidebar.title("💇 PPH Stylist App")
    user = auth.login_sidebar()
    if user is None:
        st.stop()

    st.sidebar.divider()
    week_start = week_selector()

    # Individual-screen target: stylists = themselves; managers/admins pick one.
    target = user if auth.is_stylist(user) else stylist_selector(user)

    nav_items = NAV_BY_ROLE.get(user.role, NAV_BY_ROLE["stylist"])
    st.sidebar.divider()
    screen = st.sidebar.radio("Navigate", nav_items, label_visibility="collapsed", key="nav")

    st.sidebar.divider()
    st.sidebar.caption(
        "Numbers match ‘PPH Based Payplan.xlsx’ exactly. Pay rate = 0.4 × PPH; "
        "guarantee is the floor."
    )

    # ── Dispatch ─────────────────────────────────────────────────────────
    if screen == "Team Dashboard":
        team_dashboard.render(user, week_start)
    elif screen == "Week Summary":
        week_summary.render(target, week_start)
    elif screen == "Week by Day":
        week_by_day.render(target, week_start)
    elif screen == "Goal Planner":
        goal_planner.render(target, week_start)
    elif screen in ("My Data", "Data Entry"):
        data_entry.render(user, week_start, editable_target=target)
    elif screen == "Admin":
        admin_screen.render(user, week_start)
    elif screen == "Calendar":
        extras.render_calendar(target, week_start)
    elif screen == "Promotions":
        extras.render_promotions(target, week_start)
    elif screen == "Notifications":
        extras.render_notifications(target, week_start)


if __name__ == "__main__":
    main()
else:
    # Streamlit executes the module top-level (not __main__), so call main here.
    main()

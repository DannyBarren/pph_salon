"""Secondary screens shown in the PDF: Calendar, Promotions, Notifications.

MVP placeholders wired to the current schedule/week so they feel real; each is a
clear extension point for future work.
"""

from __future__ import annotations

import streamlit as st

import data_models as db
from screens.common import WEEKDAYS, money, week_dates, week_label


def render_calendar(target: db.User, week_start: str) -> None:
    st.subheader("Calendar")
    st.caption(f"Week of {week_label(week_start)}")
    wd = db.get_weekly_data(target.id, week_start)
    dates = week_dates(week_start)
    cols = st.columns(7)
    for i, c in enumerate(cols):
        sched = wd.scheduled_hours[i] if wd else 0
        with c:
            st.markdown(f"**{WEEKDAYS[i]}**")
            st.caption(dates[i][5:])
            if sched:
                st.success(f"{sched:g}h")
            else:
                st.write("—")
    st.info("Full appointment-level calendar (Zenoti sync) is a planned integration.")


def render_promotions(target: db.User, week_start: str) -> None:
    st.subheader("Current Promotions")
    promos = [
        ("Summer Color Event", "Balayage & gloss add-ons — great for boosting PPH via color services."),
        ("Refer-a-Friend", "New-client referral bonus running through the month."),
        ("Retail Push", "Sulfate-free line — retail counts toward production goals."),
    ]
    for title, body in promos:
        with st.container(border=True):
            st.markdown(f"**{title}**")
            st.write(body)
    st.caption(f"Colors at {money(85)} lift production faster than haircuts at {money(23)}.")


def render_notifications(target: db.User, week_start: str) -> None:
    st.subheader("Notifications")
    wd = db.get_weekly_data(target.id, week_start)
    if wd is None:
        st.write("No notifications.")
        return
    msgs = []
    if wd.total_actual == 0:
        msgs.append("🗓️ No hours logged yet this week.")
    if wd.total_production > 0:
        pph = wd.total_production / wd.total_actual if wd.total_actual else 0
        msgs.append(f"📈 You're at {pph:.1f} PPH so far — keep it up!")
    msgs.append("ℹ️ Reminder: color services add the most to your production.")
    for m in msgs:
        st.info(m)

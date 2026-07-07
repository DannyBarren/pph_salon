"""Team Dashboard — the manager's composite leadership view.

Team totals at a glance plus a per-stylist breakdown. Managers can drill into an
individual stylist (read-only). No stylist ever sees another stylist's numbers —
this screen is gated to managers/admins in ``app.py``.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

import auth
import calculations as calc
import data_models as db
from screens.common import money, week_label


def render(viewer: db.User, week_start: str) -> None:
    st.subheader("Team Dashboard")
    st.caption(f"Week of {week_label(week_start)} · {'All salons' if viewer.role == 'admin' else 'Your salon'}")

    stylists = auth.visible_stylists(viewer)
    if not stylists:
        st.info("No stylists in scope.")
        return

    per_stylist = []
    team_sched = team_actual = team_prod = 0.0
    team_hc = team_co = 0
    on_track = at_risk = 0

    for s in stylists:
        wd = db.get_weekly_data(s.id, week_start)
        if wd is None:
            per_stylist.append({"Stylist": s.name, "Status": "No data"})
            continue
        summ = calc.summarize_performance(
            scheduled_hours=wd.total_scheduled,
            hours_worked=wd.total_actual,
            production=wd.total_production,
            guarantee_rate=s.guarantee_rate,
            haircuts=wd.total_haircuts,
            colors=wd.total_colors,
        )
        team_sched += wd.total_scheduled
        team_actual += wd.total_actual
        team_prod += wd.total_production
        team_hc += wd.total_haircuts
        team_co += wd.total_colors

        # "On track" = beating the minimum-expected floor.
        os_val = summ.over_short_vs_min
        status = "🟢 On track" if os_val >= 0 else "🔴 Behind"
        if os_val >= 0:
            on_track += 1
        else:
            at_risk += 1

        per_stylist.append({
            "Stylist": s.name,
            "Guarantee": f"${s.guarantee_rate:g}",
            "Sched Hrs": f"{wd.total_scheduled:g}",
            "Worked Hrs": f"{wd.total_actual:g}",
            "Production": money(summ.production),
            "PPH": f"{summ.current_pph:.1f}",
            "Pay Rate": f"${summ.earned_pay_rate:g}",
            "Week Pay": money(summ.weeks_pay_at_current_pph),
            "Over/Short": money(os_val),
            "Status": status,
        })

    # ── Composite KPIs ──────────────────────────────────────────────────
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Stylists", len(stylists))
    c2.metric("Team Production", money(team_prod))
    c3.metric("Team Hours (worked/sched)", f"{team_actual:g} / {team_sched:g}")
    team_pph = team_prod / team_actual if team_actual else 0
    c4.metric("Team PPH", f"{team_pph:.1f}")

    c5, c6, c7 = st.columns(3)
    c5.metric("On Track", on_track)
    c6.metric("Behind", at_risk)
    c7.metric("Haircuts / Colors", f"{team_hc} / {team_co}")

    st.divider()
    st.markdown("#### Per-stylist breakdown")
    st.dataframe(pd.DataFrame(per_stylist), hide_index=True, use_container_width=True)

    # ── Drill-in (read-only) ────────────────────────────────────────────
    st.divider()
    st.markdown("#### Drill into a stylist")
    names = {s.id: s.name for s in stylists}
    chosen = st.selectbox("Stylist", list(names.keys()), format_func=lambda i: names[i])
    if chosen:
        from screens import week_summary

        st.info("Read-only view — managers cannot edit stylist production data.")
        week_summary.render(db.get_user(chosen), week_start)

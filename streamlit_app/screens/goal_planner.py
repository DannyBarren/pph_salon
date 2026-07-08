"""Goal Planner (renamed from "What If").

Enter planned hours (per day or total) and instantly see the production,
haircuts, and colors required to hit each pay-rate tier. The current/guarantee
tier is highlighted. Optionally enter production-so-far to see what's left.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

import calculations as calc
import data_models as db
from screens.common import WEEKDAYS, money, week_label


def render(target: db.User, week_start: str) -> None:
    st.subheader(f"Goal Planner — {target.name}")
    st.caption(
        f"Guarantee ${target.guarantee_rate:g}/hr · plan any schedule and see what it takes "
        "to reach each pay rate."
    )

    wd = db.get_weekly_data(target.id, week_start)
    default_hours = wd.scheduled_hours if wd else [8, 8, 8, 8, 8, 0, 0]

    mode = st.radio("Enter hours as", ["Per day", "Total only"], horizontal=True, key="gp_mode")

    if mode == "Per day":
        st.markdown("**Planned scheduled hours** (0 for days off / call-offs)")
        cols = st.columns(7)
        daily = []
        for i, c in enumerate(cols):
            daily.append(
                c.number_input(
                    WEEKDAYS[i], min_value=0.0, max_value=24.0, step=0.25,
                    value=float(default_hours[i]), key=f"gp_day_{i}",
                )
            )
    else:
        total = st.number_input(
            "Total planned hours this week", min_value=0.0, max_value=80.0, step=0.5,
            value=float(sum(default_hours)),
        )
        # Spread evenly across 5 days for the daily-target preview.
        per = total / 5 if total else 0
        daily = [per, per, per, per, per, 0.0, 0.0]

    total_hours = sum(daily)
    production_so_far = st.number_input(
        "Production so far this week (optional)", min_value=0.0, step=10.0, value=float(wd.total_production) if wd else 0.0,
        help="Enter current production to see what's still needed and which tier you've reached.",
    )

    if total_hours <= 0:
        st.warning("Planned hours are 0 (full-week call-off) — no production targets to show.")
        return

    earned = calc.pay_rate_for_pph(
        production_so_far / total_hours if total_hours else 0, target.guarantee_rate
    )

    table = calc.build_tier_table(target.guarantee_rate, daily)
    rows = []
    for row in table:
        if not row.at_or_above_guarantee:
            continue  # only meaningful rows (>= guarantee)
        still_needed = max(0.0, row.weekly_required - production_so_far)
        # Marker column conveys the guarantee/current tier without a Styler.
        marker = ""
        if row.pay_rate == int(target.guarantee_rate):
            marker = "⭐ Guarantee"
        elif row.pay_rate == earned and production_so_far > 0:
            marker = "✅ Current"
        rows.append({
            "": marker,
            "Pay Rate": f"${row.pay_rate}",
            "PPH": row.pph,
            "Weekly Production": money(row.weekly_required),
            "Haircuts (all)": row.haircuts_all,
            "Colors (all)": row.colors_all,
            "Still Needed": money(still_needed),
            "Week Pay": money(row.weekly_pay),
            "Pay Incr": money(row.weekly_pay_incr),
        })

    df = pd.DataFrame(rows)

    st.markdown(f"**Planned total: {total_hours:g}h** · ⭐ = guarantee tier"
                + (f", ✅ = current tier (${earned})" if production_so_far > 0 else ""))
    st.dataframe(df, hide_index=True, use_container_width=True)

    if production_so_far > 0:
        c1, c2, c3 = st.columns(3)
        c1.metric("Current PPH", f"{production_so_far / total_hours:.1f}")
        c2.metric("Tier Reached", f"${earned}/hr")
        nxt = next((r for r in table if r.pay_rate > earned and r.at_or_above_guarantee), None)
        if nxt:
            gap = max(0.0, nxt.weekly_required - production_so_far)
            c3.metric(f"To reach ${nxt.pay_rate}", money(gap),
                      help=f"≈ {calc.haircuts_for_production(gap)} haircuts or {calc.colors_for_production(gap)} colors")

    st.caption(
        f"Daily target = PPH × that day's hours (only at/above the ${target.guarantee_rate:g} guarantee). "
        f"Haircuts at ${calc.HAIRCUT_PRICE:g}, colors at ${calc.COLOR_PRICE:g}. PPH = pay rate ÷ 0.4."
    )

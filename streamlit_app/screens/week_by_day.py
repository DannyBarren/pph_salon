"""Week by Day — daily scheduled/actual hours, production, required, over/short."""

from __future__ import annotations

import streamlit as st

import calculations as calc
import data_models as db
from screens.common import WEEKDAYS, money, week_dates, week_label


def render(target: db.User, week_start: str) -> None:
    st.subheader(f"Week by Day — {target.name}")
    st.caption(f"Week of {week_label(week_start)}")

    wd = db.get_weekly_data(target.id, week_start)
    if wd is None:
        st.info("No data recorded for this week yet.")
        return

    # The tier the manager/stylist wants to measure each day against.
    tier_options = [r for r in calc.PAY_RATES if r >= target.guarantee_rate]
    default_idx = tier_options.index(int(target.guarantee_rate)) if int(target.guarantee_rate) in tier_options else 0
    target_rate = st.selectbox(
        "Measure daily Over/Short against pay rate",
        tier_options,
        index=default_idx,
        format_func=lambda r: f"${r}/hr (PPH {calc.pph_for_rate(r)})"
        + (" — guarantee" if r == target.guarantee_rate else ""),
    )

    required = calc.daily_targets(target_rate, target.guarantee_rate, wd.scheduled_hours)
    dates = week_dates(week_start)

    rows = []
    for i in range(7):
        if wd.scheduled_hours[i] == 0 and wd.actual_hours[i] == 0 and wd.production[i] == 0:
            continue  # skip days entirely off
        os_val = calc.over_short(wd.production[i], required[i])
        # Green/red conveyed via emoji + sign (no Styler / jinja2 dependency).
        os_str = f"{'🟢' if os_val >= 0 else '🔴'} {'+' if os_val >= 0 else '−'}{money(abs(os_val))}"
        rows.append({
            "Day": f"{WEEKDAYS[i]} {dates[i][5:]}",
            "Scheduled": f"{wd.scheduled_hours[i]:g}h",
            "Actual": f"{wd.actual_hours[i]:g}h",
            "Production": money(wd.production[i]),
            f"Required @ ${target_rate}": money(required[i]),
            "Over / Short": os_str,
            "Haircuts": wd.haircuts[i],
            "Colors": wd.colors[i],
        })

    if not rows:
        st.info("No scheduled or worked days in this week.")
        return

    import pandas as pd

    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)

    # Weekly totals row.
    total_required = sum(required)
    total_os = calc.over_short(wd.total_production, total_required)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Production", money(wd.total_production))
    c2.metric(f"Total Required @ ${target_rate}", money(total_required))
    c3.metric("Week Over / Short", money(total_os), delta=f"{total_os:+.0f}")
    c4.metric("Haircuts / Colors", f"{wd.total_haircuts} / {wd.total_colors}")

    st.caption("Over/Short = Actual production − Required production for the selected pay rate.")

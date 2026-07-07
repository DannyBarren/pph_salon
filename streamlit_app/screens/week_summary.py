"""Week in Summary — the stylist's default screen (matches the PDF mockup)."""

from __future__ import annotations

import streamlit as st

import calculations as calc
import data_models as db
from screens.common import money, over_short_md, week_label


def render(target: db.User, week_start: str) -> None:
    st.subheader(f"Week in Summary — {target.name}")
    st.caption(f"Week of {week_label(week_start)} · Guarantee ${target.guarantee_rate:g}/hr")

    wd = db.get_weekly_data(target.id, week_start)
    if wd is None:
        st.info("No data recorded for this week yet. Add it under **Admin → Data Entry** or Import.")
        return

    summary = calc.summarize_performance(
        scheduled_hours=wd.total_scheduled,
        hours_worked=wd.total_actual,
        production=wd.total_production,
        guarantee_rate=target.guarantee_rate,
        haircuts=wd.total_haircuts,
        colors=wd.total_colors,
    )

    # ── Headline metrics ────────────────────────────────────────────────
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Scheduled Hours", f"{wd.total_scheduled:g}h")
    c2.metric("Hours Worked", f"{wd.total_actual:g}h")
    c3.metric("Current Production", money(summary.production))
    c4.metric(
        "Current PPH",
        f"{summary.current_pph:.1f}",
        help="Production per hour = production ÷ hours worked. Pay rate = 0.4 × PPH.",
    )

    c5, c6, c7, c8 = st.columns(4)
    c5.metric(
        "Week's Pay at Current PPH",
        money(summary.weeks_pay_at_current_pph),
        help="Earned pay rate × hours worked, floored at the guarantee.",
    )
    c6.metric("Earned Pay Rate", f"${summary.earned_pay_rate:g}/hr" + (" (guarantee)" if summary.on_guarantee else ""))
    c7.metric("Haircuts", f"{summary.haircuts}")
    c8.metric("Color Services", f"{summary.colors}")

    st.divider()

    # ── Over / short vs the minimum-expected floor ──────────────────────
    st.markdown("#### Progress vs. minimum expected")
    left, right = st.columns([2, 1])
    with left:
        target_prod = max(summary.min_expected, 1)
        pct = min(1.0, summary.production / target_prod)
        st.progress(pct, text=f"{money(summary.production)} of {money(summary.min_expected)} minimum expected")
        st.markdown(
            f"Over / Short vs minimum: {over_short_md(summary.over_short_vs_min)}",
            unsafe_allow_html=True,
        )
    with right:
        st.metric("Min Expected", money(summary.min_expected),
                  help="ROUND(Guarantee ÷ 0.4 × scheduled hours, 0)")

    st.divider()

    # ── Production needed to sustain the next tiers ─────────────────────
    st.markdown("#### Production still needed to reach the next pay rates")
    total_hours = wd.total_scheduled
    rows = []
    for rate in [r for r in calc.PAY_RATES if r > summary.earned_pay_rate][:4]:
        needed = calc.production_needed_to_sustain(rate, target.guarantee_rate, total_hours, summary.production)
        rows.append({
            "Pay Rate": f"${rate}/hr",
            "PPH": calc.pph_for_rate(rate),
            "Weekly Target": money(calc.weekly_required(rate, target.guarantee_rate, total_hours)),
            "Still Needed": money(needed),
            "Haircuts (all)": calc.haircuts_for_production(needed),
            "Colors (all)": calc.colors_for_production(needed),
        })
    if rows:
        st.dataframe(rows, hide_index=True, use_container_width=True)
    else:
        st.success("Top pay-rate tier reached for this schedule. 🎉")

    st.caption(
        f"Assumes haircuts at ${calc.HAIRCUT_PRICE:g} and colors at ${calc.COLOR_PRICE:g}. "
        "PPH targets = pay rate ÷ 0.4."
    )

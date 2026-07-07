"""Data Entry — manual entry/override of hours + production.

Stylists may edit **their own** week; admins may edit anyone's. Managers are
read-only (handled by the nav gate in ``app.py``). Production is derived from
haircut/color counts using the salon's prices, but can be overridden.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

import auth
import calculations as calc
import data_models as db
from screens.common import WEEKDAYS, week_label


def render(actor: db.User, week_start: str, editable_target: db.User) -> None:
    st.subheader(f"Data Entry — {editable_target.name}")
    st.caption(f"Week of {week_label(week_start)}")

    if not auth.can_edit_user_data(actor, editable_target.id):
        st.warning("You don't have permission to edit this stylist's data.")
        return

    salon = db.get_salon(editable_target.salon_id)
    hc_price = salon.haircut_price if salon else calc.HAIRCUT_PRICE
    co_price = salon.color_price if salon else calc.COLOR_PRICE

    wd = db.get_weekly_data(editable_target.id, week_start) or db.WeeklyData(
        user_id=editable_target.id, week_start=week_start
    )

    grid = pd.DataFrame(
        {
            "Day": WEEKDAYS,
            "Scheduled Hrs": wd.scheduled_hours,
            "Actual Hrs": wd.actual_hours,
            "Haircuts": wd.haircuts,
            "Colors": wd.colors,
            "Production ($)": wd.production,
        }
    )
    st.caption(
        f"Leave Production blank/0 to auto-derive it as haircuts × ${hc_price:g} + colors × ${co_price:g}."
    )
    edited = st.data_editor(
        grid,
        hide_index=True,
        use_container_width=True,
        disabled=["Day"],
        column_config={
            "Scheduled Hrs": st.column_config.NumberColumn(min_value=0.0, step=0.25),
            "Actual Hrs": st.column_config.NumberColumn(min_value=0.0, step=0.25),
            "Haircuts": st.column_config.NumberColumn(min_value=0, step=1),
            "Colors": st.column_config.NumberColumn(min_value=0, step=1),
            "Production ($)": st.column_config.NumberColumn(min_value=0.0, step=1.0),
        },
        key=f"editor_{editable_target.id}_{week_start}",
    )

    if st.button("💾 Save week", type="primary"):
        sched = [float(x or 0) for x in edited["Scheduled Hrs"]]
        actual = [float(x or 0) for x in edited["Actual Hrs"]]
        hc = [int(x or 0) for x in edited["Haircuts"]]
        co = [int(x or 0) for x in edited["Colors"]]
        prod_in = [float(x or 0) for x in edited["Production ($)"]]
        # Derive production where not explicitly provided.
        production = [p if p > 0 else h * hc_price + c * co_price for p, h, c in zip(prod_in, hc, co)]

        db.upsert_weekly_data(
            db.WeeklyData(
                user_id=editable_target.id,
                week_start=week_start,
                scheduled_hours=sched,
                actual_hours=actual,
                haircuts=hc,
                colors=co,
                production=production,
                notes=wd.notes,
            )
        )
        st.success("Saved. Numbers update everywhere instantly.")
        st.rerun()

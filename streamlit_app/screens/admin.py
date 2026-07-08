"""Admin — salon settings, pay assumptions, users, and bulk import (admin only)."""

from __future__ import annotations

import pandas as pd
import streamlit as st

import calculations as calc
import data_models as db
import import_utils


def render(actor: db.User, week_start: str) -> None:
    st.subheader("Admin & Configuration")
    st.caption("Salon settings, pay assumptions, users, and data import (Inputs sheet logic).")

    tab_cfg, tab_users, tab_import = st.tabs(["Pay & Salon Config", "Users", "Import Data"])

    # ── Config ──────────────────────────────────────────────────────────
    with tab_cfg:
        st.markdown("#### Pay-plan assumptions (from the Excel)")
        c1, c2, c3 = st.columns(3)
        c1.metric("Production factor (B6)", f"{calc.NP_FACTOR}")
        c2.metric("NP%", f"{calc.np_percent(True) * 100:.1f}%")
        c3.metric("Pay = 0.4 × PPH", "rate = PPH × 0.4")
        st.info(
            "PPH = ROUND(pay rate ÷ 0.4, 0). Daily target = PPH × daily hours (at/above guarantee). "
            "Min expected = ROUND(guarantee ÷ 0.4 × hours, 0). These match the workbook exactly."
        )

        st.markdown("#### Salon service prices")
        for salon in db.list_salons():
            with st.form(f"salon_{salon.id}"):
                st.write(f"**{salon.name}**")
                a, b = st.columns(2)
                hc = a.number_input("Haircut price", value=float(salon.haircut_price), step=1.0, key=f"hc_{salon.id}")
                co = b.number_input("Color price", value=float(salon.color_price), step=1.0, key=f"co_{salon.id}")
                if st.form_submit_button("Save salon"):
                    db.upsert_salon(db.Salon(id=salon.id, name=salon.name, haircut_price=hc, color_price=co))
                    st.success("Saved.")
                    st.rerun()

        st.markdown("#### Stylist guarantee pay rates (from PayCor)")
        stylists = db.list_users(role="stylist")
        grid = pd.DataFrame([{"id": s.id, "Stylist": s.name, "Guarantee $/hr": s.guarantee_rate} for s in stylists])
        edited = st.data_editor(
            grid, hide_index=True, use_container_width=True, disabled=["id", "Stylist"],
            column_config={"Guarantee $/hr": st.column_config.NumberColumn(min_value=0.0, step=0.5)},
            key="guarantee_editor",
        )
        if st.button("Save guarantee rates"):
            for _, r in edited.iterrows():
                u = db.get_user(r["id"])
                if u:
                    u.guarantee_rate = float(r["Guarantee $/hr"])
                    db.upsert_user(u)
            st.success("Guarantee rates updated.")
            st.rerun()

    # ── Users ───────────────────────────────────────────────────────────
    with tab_users:
        st.markdown("#### Existing users")
        st.dataframe(
            [{"ID": u.id, "Name": u.name, "Role": u.role, "Salon": u.salon_id, "Guarantee": u.guarantee_rate}
             for u in db.list_users()],
            hide_index=True, use_container_width=True,
        )
        st.markdown("#### Add a user")
        with st.form("add_user"):
            a, b = st.columns(2)
            uid = a.text_input("User ID (e.g. jane)")
            name = b.text_input("Name")
            c, d, e = st.columns(3)
            role = c.selectbox("Role", ["stylist", "manager", "admin"])
            salon_id = d.selectbox("Salon", [s.id for s in db.list_salons()])
            guarantee = e.number_input("Guarantee $/hr", value=12.0, step=0.5)
            if st.form_submit_button("Add user") and uid and name:
                db.upsert_user(db.User(id=uid.strip(), name=name.strip(), role=role, salon_id=salon_id, guarantee_rate=guarantee))
                st.success(f"Added {name}.")
                st.rerun()

    # ── Import ──────────────────────────────────────────────────────────
    with tab_import:
        st.markdown("#### Bulk import hours + production (Zenoti-style, per-day rows)")
        st.download_button("⬇️ Download CSV template", import_utils.template_csv(), "pph_import_template.csv")
        st.caption("Columns: " + ", ".join(import_utils.TEMPLATE_COLUMNS))

        up = st.file_uploader("Upload CSV or Excel", type=["csv", "xlsx", "xls"])
        pasted = st.text_area("…or paste rows (CSV/TSV, incl. header)", height=140)

        df = None
        if up is not None:
            df = import_utils.read_upload(up)
        elif pasted.strip():
            try:
                df = import_utils.parse_pasted(pasted)
            except Exception as exc:  # noqa: BLE001
                st.error(f"Could not parse pasted text: {exc}")

        if df is not None:
            st.write("Preview:")
            st.dataframe(df.head(20), hide_index=True, use_container_width=True)
            rows, errors = import_utils.parse_weekly_rows(df)
            for e in errors:
                st.warning(e)
            st.write(f"**{len(rows)}** stylist-week rows ready to import.")
            if rows and st.button("Import (upsert by user_id + week_start)", type="primary"):
                imported = 0
                for wd in rows:
                    if db.get_user(wd.user_id) is None:
                        st.warning(f"Skipped unknown user_id '{wd.user_id}'.")
                        continue
                    db.upsert_weekly_data(wd)
                    imported += 1
                st.success(f"Imported {imported} stylist-week(s).")
                st.rerun()

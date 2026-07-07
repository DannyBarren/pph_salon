# PPH Stylist App — Streamlit MVP

A working MVP that stylists and salon managers can actually use. It replicates
the pay-calculation logic from **`PPH Based Payplan.xlsx`** exactly and follows
the screen flows from **`PPH Stylist App.pdf`**.

> Standalone app under `streamlit_app/` — it doesn't touch the existing Next.js /
> FastAPI code in this repo. It has its own SQLite DB and requirements.

## Quick start

```bash
cd streamlit_app
python -m venv .venv && source .venv/bin/activate     # optional
pip install -r requirements.txt
streamlit run app.py                                   # opens http://localhost:8501
```

The database (`streamlit_app/pph.db`, SQLite) is created and seeded with the
**Rebeca** (Sched View) and **Steph** (Actual) golden examples plus two extra
stylists, a manager, and an admin on first run.

## The pay math (reality on the ground)

All logic lives in `calculations.py`, verified cell-for-cell against the Excel:

| Concept | Formula |
| --- | --- |
| Production factor (B6) | `0.4` — **pay rate = 0.4 × PPH** |
| PPH for a pay rate | `ROUND(pay_rate / 0.4, 0)` (Excel half-up: 13/0.4 = 32.5 → **33**) |
| Daily target | `PPH × daily_hours` (only when pay rate ≥ guarantee) |
| Weekly required | `SUM(daily targets)` |
| Min expected (N3) | `ROUND(guarantee / 0.4 × total_hours, 0)` |
| Wkly Svcs Incr | `IF(rate ≤ guarantee, 0, weekly_required − min_expected)` |
| Wkly Pay / Pay Incr | `hours × rate` / `hours × (rate − guarantee)` |
| NP% | `1 − 0.4 − (16%+5%+1.5%+18%) = 19.5%` |
| Services | haircut **$23**, color **$85** |

The guarantee pay rate (e.g. $12 / $13) is always the floor.

### Golden-case tests

```bash
pytest tests/                     # or:  python tests/test_calculations.py
```

These assert the exact workbook numbers for Rebeca and Steph (weekly required,
min-expected, increments, daily targets, over/short, etc.).

## Roles & permissions

| Role | Default view | Can do |
| --- | --- | --- |
| **Stylist** | Week Summary | See + edit **only their own** data |
| **Salon Manager** | Team Dashboard | See composite team + drill into stylists (**read-only**) |
| **Admin / SDL** | Team Dashboard | Everything: edit any data, users, tiers, salon prices, import |

Switch accounts with the sidebar user switcher (MVP auth). No stylist can ever
see another stylist's numbers.

## Screens (match the PDF)

- **Week in Summary** — scheduled/worked hours, production, **Current PPH**,
  week's pay at current PPH, production still needed per tier, haircuts/colors.
- **Week by Day** — daily hours, production, required-per-tier, **Over/Short**
  (green/red), haircuts, colors.
- **Goal Planner** (was “What If”) — enter planned hours (per day or total) →
  required production/haircuts/colors for every tier; guarantee + current tiers
  highlighted.
- **Team Dashboard** (manager/admin) — team totals + per-stylist breakdown.
- **Data Entry** — manual entry/override (stylist: own; admin: anyone).
- **Admin** — salon prices, guarantee rates (PayCor), users, and **bulk import**.
- **Calendar / Promotions / Notifications** — MVP versions of the PDF tabs.

## Importing real data (Zenoti workflow)

Zenoti provides **Scheduled Hours, Actual Hours, Actual Service Sales**; PayCor
provides pay rates. For the MVP:

1. Admin → **Import Data** → download the CSV template.
2. Export your Zenoti report as a per-day file with columns:
   `user_id, week_start, day, scheduled_hours, actual_hours, haircuts, colors, production`
   (`production` optional — auto-derived from haircuts/colors if blank).
3. Upload the CSV/Excel or paste the rows. Import **upserts by
   `user_id + week_start`**, so re-imports are safe.

## Project structure

```
streamlit_app/
├── app.py              # entry point + role-based navigation
├── calculations.py     # PPH engine (pure, exact Excel port)
├── data_models.py      # SQLite persistence + repository functions
├── seed_data.py        # Rebeca + Steph golden data + demo team
├── auth.py             # session-based roles & permissions
├── import_utils.py     # CSV/Excel/paste import (Zenoti-style)
├── screens/            # one module per screen
└── tests/              # golden-case tests
```

## Next steps

- **Real auth**: replace the user switcher with SSO (PayCor) or email/password.
- **Zenoti API integration**: pull hours + sales automatically instead of CSV.
- **Postgres**: swap `data_models._connect` (schema is already portable).
- **Per-salon tiers / service mix config** and richer charts.
- **Deployment**: Streamlit Community Cloud, or Docker behind your VPN.

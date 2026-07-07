"""Demo seed data — the Rebeca (Sched View) and Steph (Actual) golden examples
from the workbook, plus a couple of extra stylists so the Manager team view is
meaningful. Loaded once into an empty database.

Production per day is derived from the seeded haircut/color counts using the
salon's prices ($23 / $85), so every figure ties out to the workbook economics.
"""

from __future__ import annotations

from data_models import Salon, User, WeeklyData, list_users, upsert_salon, upsert_user, upsert_weekly_data

HAIRCUT_PRICE = 23.0
COLOR_PRICE = 85.0

# A single shared demo week (Mon 2026-06-29 → Sun 2026-07-05).
CURRENT_WEEK = "2026-06-29"

SALON = Salon(id="s1", name="Radiant Salon — Downtown", haircut_price=23.0, color_price=85.0)

USERS = [
    # Real golden-case stylists (guarantee rates straight from the workbook).
    User(id="rebeca", name="Rebeca", role="stylist", salon_id="s1", guarantee_rate=12.0),
    User(id="steph", name="Steph", role="stylist", salon_id="s1", guarantee_rate=13.0),
    # Extra modeled stylists for a realistic team.
    User(id="maya", name="Maya Patel", role="stylist", salon_id="s1", guarantee_rate=13.0),
    User(id="leo", name="Leo Martins", role="stylist", salon_id="s1", guarantee_rate=12.0),
    # Leadership.
    User(id="nina", name="Nina Alvarez", role="manager", salon_id="s1", guarantee_rate=0.0),
    User(id="admin", name="Owner / Admin", role="admin", salon_id="s1", guarantee_rate=0.0),
]


def _production(haircuts: list[int], colors: list[int]) -> list[float]:
    return [h * HAIRCUT_PRICE + c * COLOR_PRICE for h, c in zip(haircuts, colors)]


# Each entry: (user_id, scheduled_hours[7], actual_hours[7], haircuts[7], colors[7])
# Days are Mon..Sun.
_SEED_WEEKS = [
    # Rebeca — "Sched View": guarantee 12, 27.25 scheduled hrs.
    (
        "rebeca",
        [5.25, 6.25, 5.25, 5.25, 5.25, 0, 0],
        [5.25, 6.25, 5.25, 5.25, 5.0, 0, 0],
        [3, 4, 2, 3, 4, 0, 0],
        [2, 2, 2, 2, 2, 0, 0],
    ),
    # Steph — "Actual": guarantee 13, 28 scheduled hrs. ~$1,110 → PPH ≈ 39.6 (tier 15).
    (
        "steph",
        [3, 5, 4, 4, 6, 6, 0],
        [3, 5, 3.5, 4, 6, 6, 0],
        [2, 3, 2, 2, 3, 3, 0],
        [1, 1, 1, 2, 2, 2, 0],
    ),
    # Maya — strong week.
    (
        "maya",
        [8, 8, 8, 8, 8, 0, 0],
        [8, 8, 8, 8, 8, 0, 0],
        [4, 5, 4, 5, 4, 0, 0],
        [3, 3, 4, 3, 4, 0, 0],
    ),
    # Leo — behind pace (riding the guarantee).
    (
        "leo",
        [6, 6, 6, 6, 6, 0, 0],
        [6, 5, 6, 5, 6, 0, 0],
        [2, 1, 2, 2, 1, 0, 0],
        [0, 1, 1, 0, 1, 0, 0],
    ),
]


def seed_if_empty() -> None:
    """Populate the DB with demo data only if there are no users yet."""
    if list_users():
        return
    upsert_salon(SALON)
    for u in USERS:
        upsert_user(u)
    for user_id, sched, actual, hc, co in _SEED_WEEKS:
        upsert_weekly_data(
            WeeklyData(
                user_id=user_id,
                week_start=CURRENT_WEEK,
                scheduled_hours=[float(x) for x in sched],
                actual_hours=[float(x) for x in actual],
                haircuts=[int(x) for x in hc],
                colors=[int(x) for x in co],
                production=_production([int(x) for x in hc], [int(x) for x in co]),
            )
        )

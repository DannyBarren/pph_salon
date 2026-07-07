"""PPH pay calculation engine — an exact port of ``PPH Based Payplan.xlsx``.

This module is the single source of truth for every number the app shows. It
reproduces the workbook's formulas cell-for-cell (verified against the "Sched
View" / Rebeca and "Actual" / Steph examples).

Business logic (the "reality on the ground")
--------------------------------------------
* ``NP_FACTOR = 0.4`` (cell B6) — the net-production factor. A stylist's pay rate
  is 40% of their production-per-hour: ``pay_rate = 0.4 × PPH``. Equivalently,
  to *earn* a pay rate you must reach ``PPH = pay_rate / 0.4``.
* ``PPH = ROUND(pay_rate / 0.4, 0)`` — Excel rounds halves **up** (13/0.4 = 32.5
  rounds to **33**), so we use ``excel_round`` (ROUND_HALF_UP), not Python's
  banker's ``round``.
* Daily production target = ``PPH × daily_scheduled_hours`` — but only when the
  pay-rate tier is **at or above the guarantee** (rows below guarantee are 0).
* Guarantee pay rate (e.g. $12 / $13) is the floor: a stylist never earns below
  ``guarantee × hours``.
* Service assumptions: haircut = $23, color = $85 (cells T6 / AC6).
* NP% = ``1 − 0.4 − (16% + 5% + 1.5% + 18%) = 19.5%`` (overhead deductions).

Everything here is pure (no I/O), so it is trivially testable — see
``tests/test_calculations.py`` which asserts the exact workbook values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# ── Constants pulled directly from the workbook ──────────────────────────────
NP_FACTOR = 0.4  # cell B6 — pay_rate = NP_FACTOR × PPH
HAIRCUT_PRICE = 23.0  # cell T6
COLOR_PRICE = 85.0  # cell AC6
# Overhead deductions used by the NP% column (O): 16% + 5% + 1.5% + 18%.
OVERHEAD = 0.16 + 0.05 + 0.015 + 0.18
# The pay-rate tiers modeled in the sheet (PayRt column B, rows 9–27).
PAY_RATES: list[int] = list(range(11, 30))  # $11 … $29
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def excel_round(value: float, digits: int = 0) -> float:
    """Round like Excel's ``ROUND`` (half away from zero), unlike Python's round."""
    q = Decimal(10) ** -digits
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


def roundup(value: float) -> int:
    """Excel ``ROUNDUP(x, 0)`` — always toward +infinity for positive values."""
    return int(math.ceil(round(value, 9)))


# ── Core per-rate formulas (columns C, D–J, K, L, M, N) ──────────────────────

def pph_for_rate(pay_rate: float) -> int:
    """PPH required to earn ``pay_rate`` (col C) = ``ROUND(rate / 0.4, 0)``."""
    return int(excel_round(pay_rate / NP_FACTOR))


def pay_rate_for_pph(pph: float, guarantee_rate: float) -> int:
    """Highest whole pay-rate tier whose required PPH ≤ achieved ``pph``.

    This is the inverse tier lookup: it turns an *actual* PPH into the pay rate a
    stylist has earned, floored at the guarantee (you never drop below it).
    """
    earned = 0
    for rate in PAY_RATES:
        if pph_for_rate(rate) <= pph:
            earned = rate
        else:
            break
    return int(max(earned, guarantee_rate))


def daily_targets(pay_rate: float, guarantee_rate: float, daily_hours: list[float]) -> list[float]:
    """Per-day required production (cols D–J).

    ``IF(pay_rate < guarantee, 0, PPH × daily_hours[d])``.
    """
    if pay_rate < guarantee_rate:
        return [0.0 for _ in daily_hours]
    pph = pph_for_rate(pay_rate)
    return [pph * h for h in daily_hours]


def weekly_required(pay_rate: float, guarantee_rate: float, total_hours: float) -> float:
    """Weekly required production (col K = SUM of daily targets)."""
    if pay_rate < guarantee_rate:
        return 0.0
    return pph_for_rate(pay_rate) * total_hours


def min_expected_production(guarantee_rate: float, total_hours: float) -> float:
    """Minimum expected production (cell N3) = ``ROUND(guarantee/0.4 × hours, 0)``.

    Uses the *exact* ``guarantee / 0.4`` (not the rounded tier PPH), matching the
    sheet: guarantee 12 → 818, guarantee 13 → 910.
    """
    return excel_round((guarantee_rate / NP_FACTOR) * total_hours)


def weekly_svcs_incr(pay_rate: float, guarantee_rate: float, total_hours: float) -> float:
    """Weekly production increment above the floor (col L).

    ``IF(pay_rate <= guarantee, 0, weekly_required − min_expected)``.
    """
    if pay_rate <= guarantee_rate:
        return 0.0
    return weekly_required(pay_rate, guarantee_rate, total_hours) - min_expected_production(
        guarantee_rate, total_hours
    )


def weekly_pay(pay_rate: float, guarantee_rate: float, total_hours: float) -> float:
    """Projected weekly pay at ``pay_rate`` (col M).

    ``IF(pay_rate < guarantee, 0, total_hours × pay_rate)``.
    """
    if pay_rate < guarantee_rate:
        return 0.0
    return total_hours * pay_rate


def weekly_pay_incr(pay_rate: float, guarantee_rate: float, total_hours: float) -> float:
    """Weekly pay above the guarantee (col N).

    ``IF(pay_rate <= guarantee, 0, total_hours × (pay_rate − guarantee))``.
    """
    if pay_rate <= guarantee_rate:
        return 0.0
    return total_hours * (pay_rate - guarantee_rate)


def np_percent(active: bool = True) -> float:
    """NP% (col O). Active rows = 1 − 0.4 − overhead = 0.195; inactive = negative."""
    base = 1.0 if active else 0.0
    return base - NP_FACTOR - OVERHEAD


# ── Service-mix helpers ($23 haircut / $85 color) ────────────────────────────

def haircuts_for_production(production: float) -> int:
    """Number of haircuts (all-haircuts scenario) to cover ``production``."""
    return roundup(production / HAIRCUT_PRICE)


def colors_for_production(production: float) -> int:
    """Number of color services (all-colors scenario) to cover ``production``."""
    return roundup(production / COLOR_PRICE)


def blended_services(production: float, haircut_share: float = 0.5) -> dict[str, int]:
    """A blended split: ``haircut_share`` of production from haircuts, rest colors."""
    hc = roundup((production * haircut_share) / HAIRCUT_PRICE)
    co = roundup((production * (1 - haircut_share)) / COLOR_PRICE)
    return {"haircuts": hc, "colors": co}


# ── Structured results ───────────────────────────────────────────────────────

@dataclass
class TierRow:
    """One pay-rate row of the planner table (mirrors a spreadsheet row)."""

    pay_rate: int
    pph: int
    daily_targets: list[float]
    weekly_required: float
    weekly_svcs_incr: float
    weekly_pay: float
    weekly_pay_incr: float
    np_percent: float
    haircuts_all: int
    colors_all: int
    is_guarantee: bool
    at_or_above_guarantee: bool


def build_tier_table(guarantee_rate: float, daily_hours: list[float]) -> list[TierRow]:
    """Full planner table for a schedule — the heart of the Goal Planner screen."""
    total_hours = sum(daily_hours)
    rows: list[TierRow] = []
    for rate in PAY_RATES:
        req = weekly_required(rate, guarantee_rate, total_hours)
        rows.append(
            TierRow(
                pay_rate=rate,
                pph=pph_for_rate(rate),
                daily_targets=daily_targets(rate, guarantee_rate, daily_hours),
                weekly_required=req,
                weekly_svcs_incr=weekly_svcs_incr(rate, guarantee_rate, total_hours),
                weekly_pay=weekly_pay(rate, guarantee_rate, total_hours),
                weekly_pay_incr=weekly_pay_incr(rate, guarantee_rate, total_hours),
                np_percent=np_percent(active=req > 1),
                haircuts_all=haircuts_for_production(req),
                colors_all=colors_for_production(req),
                is_guarantee=(rate == guarantee_rate),
                at_or_above_guarantee=(rate >= guarantee_rate),
            )
        )
    return rows


@dataclass
class PerformanceSummary:
    """Actual-performance rollup for the Week Summary screen."""

    scheduled_hours: float
    hours_worked: float
    production: float
    current_pph: float
    earned_pay_rate: int
    weeks_pay_at_current_pph: float
    guarantee_pay: float
    min_expected: float
    over_short_vs_min: float
    on_guarantee: bool
    haircuts: int
    colors: int


def summarize_performance(
    *,
    scheduled_hours: float,
    hours_worked: float,
    production: float,
    guarantee_rate: float,
    haircuts: int = 0,
    colors: int = 0,
) -> PerformanceSummary:
    """Compute the actual-performance metrics shown on the Week Summary.

    ``Current PPH`` = production / hours worked. The earned pay rate is the tier
    that PPH reaches (floored at guarantee); week's pay = earned_rate × hours,
    but never below the guarantee floor.
    """
    pph = production / hours_worked if hours_worked > 0 else 0.0
    earned_rate = pay_rate_for_pph(pph, guarantee_rate)
    guarantee_pay = guarantee_rate * hours_worked
    weeks_pay = max(earned_rate * hours_worked, guarantee_pay)
    min_exp = min_expected_production(guarantee_rate, scheduled_hours)
    return PerformanceSummary(
        scheduled_hours=scheduled_hours,
        hours_worked=hours_worked,
        production=production,
        current_pph=pph,
        earned_pay_rate=earned_rate,
        weeks_pay_at_current_pph=weeks_pay,
        guarantee_pay=guarantee_pay,
        min_expected=min_exp,
        over_short_vs_min=production - min_exp,
        on_guarantee=(earned_rate <= guarantee_rate),
        haircuts=haircuts,
        colors=colors,
    )


def over_short(actual_production: float, required_production: float) -> float:
    """Over/short = actual − required (positive = over, negative = short)."""
    return actual_production - required_production


def production_needed_to_sustain(
    target_rate: float, guarantee_rate: float, total_hours: float, production_so_far: float
) -> float:
    """Remaining production still needed to reach/sustain ``target_rate``."""
    required = weekly_required(target_rate, guarantee_rate, total_hours)
    return max(0.0, required - production_so_far)

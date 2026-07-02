"""PPH (Production Per Hour) pay calculation engine.

This is the single source of truth for how pay is derived on the backend. It
mirrors the logic documented in ``docs/pay-plan-logic.md`` and the interactive
engine used by the frontend planner.

Core model
----------
Every stylist is paid the greater of a commission on their production or an
hourly guarantee:

    commission_pay = production * commission_rate
    guarantee_pay  = hours * guarantee_rate
    pay            = max(commission_pay, guarantee_pay)
    effective_rate = pay / hours          # the headline "$/hr"
    pph            = production / hours    # production per hour

To hit a *target* effective rate over a set of scheduled hours, the production
required (via commission) is:

    required_production = target_rate * hours / commission_rate

Two layers live in this module:

* The **functional helpers** (``effective_pay``, ``plan_what_if`` …) — a simple
  flat-commission approximation used by the stateless API endpoints.
* :class:`PayPlanEngine` — the **tiered, Excel-accurate** implementation that
  matches ``docs/spec/PPH Based Payplan.xlsx`` exactly (see the ``Sched View``
  and ``Actual`` sheets). New work should prefer this class.

See ``docs/pay-plan-logic.md`` for the tier table, the effective-rate method,
and worked examples.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class PayConfig:
    """Admin-configurable parameters that drive every calculation."""

    guarantee_rate: float = 16.0
    commission_rate: float = 0.42
    avg_ticket_haircut: float = 48.0
    avg_ticket_color: float = 135.0
    service_mix_haircut: float = 0.6  # fraction of projected services that are haircuts
    min_services_per_day: float = 6.0
    # Per-salon overrides of the global guarantee rate.
    salon_guarantee: dict[str, float] = field(default_factory=dict)


def guarantee_rate_for(salon_id: str | None, config: PayConfig) -> float:
    """Return the guarantee rate for a salon, falling back to the global rate."""
    if salon_id is not None and salon_id in config.salon_guarantee:
        return config.salon_guarantee[salon_id]
    return config.guarantee_rate


def effective_pay(
    production: float,
    hours: float,
    guarantee_rate: float,
    commission_rate: float,
) -> dict[str, float]:
    """Compute pay for a block of worked hours + production.

    Returns commission/guarantee/pay, the effective hourly rate, whether the
    guarantee floor is carrying the pay, and production-per-hour.
    """
    commission_pay = production * commission_rate
    guarantee_pay = hours * guarantee_rate
    pay = max(commission_pay, guarantee_pay)
    effective_rate = pay / hours if hours > 0 else 0.0
    pph = production / hours if hours > 0 else 0.0
    return {
        "commission_pay": round(commission_pay, 2),
        "guarantee_pay": round(guarantee_pay, 2),
        "pay": round(pay, 2),
        "effective_rate": round(effective_rate, 2),
        "pph": round(pph, 2),
        "on_guarantee": guarantee_pay >= commission_pay,
    }


def required_production(target_rate: float, hours: float, commission_rate: float) -> float:
    """Production needed (via commission) to reach ``target_rate`` over ``hours``."""
    if commission_rate <= 0:
        return 0.0
    return target_rate * hours / commission_rate


def production_to_sustain(target_rate: float, hours: float, config: PayConfig) -> float:
    """Alias used by the spec: production required to *sustain* a target rate."""
    return required_production(target_rate, hours, config.commission_rate)


def plan_what_if(
    *,
    target_rate: float,
    scheduled_hours: float,
    production_to_date: float,
    remaining_days: int,
    config: PayConfig,
    guarantee_rate: float,
    extra_hours: float = 0.0,
    service_mix_haircut: float | None = None,
) -> dict[str, float]:
    """Solve a "what-if" scenario for a target effective rate over a period.

    Returns the required and remaining production, per-day targets, and the
    projected haircut / color counts for the remaining production.
    """
    mix = config.service_mix_haircut if service_mix_haircut is None else service_mix_haircut
    plan_hours = scheduled_hours + extra_hours

    target_pay = target_rate * plan_hours
    req_prod = required_production(target_rate, plan_hours, config.commission_rate)
    remaining = max(0.0, req_prod - production_to_date)
    per_day_prod = remaining / remaining_days if remaining_days > 0 else remaining

    avg_ticket = mix * config.avg_ticket_haircut + (1 - mix) * config.avg_ticket_color
    projected_services = remaining / avg_ticket if avg_ticket > 0 else 0.0
    projected_haircuts = projected_services * mix
    projected_colors = projected_services * (1 - mix)

    return {
        "guarantee_rate": round(guarantee_rate, 2),
        "plan_hours": round(plan_hours, 2),
        "target_pay": round(target_pay, 2),
        "required_production": round(req_prod, 2),
        "production_to_date": round(production_to_date, 2),
        "remaining_production": round(remaining, 2),
        "per_day_production": round(per_day_prod, 2),
        "projected_services": round(projected_services, 1),
        "projected_haircuts": round(projected_haircuts, 1),
        "projected_colors": round(projected_colors, 1),
        "avg_ticket": round(avg_ticket, 2),
        "below_guarantee": target_rate <= guarantee_rate + 1e-3,
    }


def tiered_rate(pph: float, tiers: list[tuple[float, float]]) -> float:
    """Look up a pay rate from a PPH tier table.

    ``tiers`` is a list of ``(min_pph, rate)`` sorted ascending by ``min_pph``.
    Returns the rate for the highest tier whose ``min_pph`` <= ``pph``.

    This is the more literal representation of a tiered PPH plan; the exact
    bands must be reconciled with ``PPH Based Payplan.xlsx`` (see docs).
    """
    rate = 0.0
    for min_pph, tier_rate in sorted(tiers):
        if pph >= min_pph:
            rate = tier_rate
        else:
            break
    return rate


# ─────────────────────────────────────────────────────────────────────────────
#  Tiered, Excel-accurate engine
# ─────────────────────────────────────────────────────────────────────────────

# Pay tiers hardcoded from ``PPH Based Payplan.xlsx`` (columns B & C, identical
# on both the "Sched View" and "Actual" sheets). Each entry maps a pay rate
# ($/hr) to the Production-Per-Hour (PPH) required to earn it. The underlying
# relationship is ``pay_rate = round_half_up(pph * 0.4)`` — i.e. a 40% net
# production share — but the table is stored explicitly so it matches the sheet
# to the cent and can later be replaced by per-salon, DB-backed tiers.
#
#   (pay_rate, pph_required)
DEFAULT_PPH_TIERS: list[tuple[int, int]] = [
    (11, 28), (12, 30), (13, 33), (14, 35), (15, 38), (16, 40), (17, 43),
    (18, 45), (19, 48), (20, 50), (21, 53), (22, 55), (23, 58), (24, 60),
    (25, 63), (26, 65), (27, 68), (28, 70), (29, 73),
]

# The net-production share implied by the tiers (cell ``B6`` on both sheets).
DEFAULT_NP_RATE = 0.4
# Per-service production values (cells ``T6`` / ``AC6``).
DEFAULT_HAIRCUT_PRICE = 23.0
DEFAULT_COLOR_PRICE = 85.0


@dataclass(frozen=True)
class Tier:
    pay_rate: float
    pph_required: float


class PayPlanEngine:
    """Excel-accurate PPH pay engine.

    Reproduces the math in ``PPH Based Payplan.xlsx``. All monetary values are
    returned unrounded unless a method documents otherwise, so callers can round
    for display. The engine is deterministic and free of side effects.

    Parameters
    ----------
    guarantee_rate:
        The stylist's guaranteed hourly pay ($/hr). The two worked examples in
        the workbook use ``12`` ("Sched View") and ``13`` ("Actual").
    np_rate:
        Net-production share used to derive the min-expected floor (``0.4``).
    haircut_price / color_price:
        Per-service production values used by :meth:`suggest_service_mix`.
    tiers:
        Optional explicit tier list; defaults to :data:`DEFAULT_PPH_TIERS`.
    """

    def __init__(
        self,
        guarantee_rate: float = 12.0,
        *,
        np_rate: float = DEFAULT_NP_RATE,
        haircut_price: float = DEFAULT_HAIRCUT_PRICE,
        color_price: float = DEFAULT_COLOR_PRICE,
        tiers: list[tuple[float, float]] | None = None,
        salon_tiers: dict[int, list[tuple[float, float]]] | None = None,
    ) -> None:
        self.guarantee_rate = guarantee_rate
        self.np_rate = np_rate
        self.haircut_price = haircut_price
        self.color_price = color_price
        # Registry for future per-salon (DB-backed) tier overrides.
        self._salon_tiers = salon_tiers or {}
        self._set_tiers(tiers if tiers is not None else DEFAULT_PPH_TIERS)

    # -- tier management ---------------------------------------------------

    def _set_tiers(self, tiers: list[tuple[float, float]]) -> None:
        self.tiers = [Tier(float(r), float(p)) for r, p in sorted(tiers)]
        self._pph_by_rate = {t.pay_rate: t.pph_required for t in self.tiers}

    def load_tiers(self, salon_id: int) -> list[Tier]:
        """Load (and activate) the pay tiers for ``salon_id``.

        Currently returns the hardcoded default table for every salon. A future
        agent can back this with the database by populating ``salon_tiers`` (or
        overriding this method to query a repository) — the rest of the engine
        needs no changes.
        """
        tiers = self._salon_tiers.get(salon_id, DEFAULT_PPH_TIERS)
        self._set_tiers(tiers)
        return self.tiers

    def pph_for_rate(self, pay_rate: float) -> float:
        """PPH required to earn ``pay_rate``.

        Exact tier value when ``pay_rate`` is one of the table rows (matching the
        sheet, including its half-up rounding); otherwise the exact ``pay_rate /
        np_rate`` relationship for off-tier rates.
        """
        if pay_rate in self._pph_by_rate:
            return self._pph_by_rate[pay_rate]
        return pay_rate / self.np_rate

    # -- required production ----------------------------------------------

    def get_required_weekly_production(self, desired_rate: float, scheduled_hours: float) -> float:
        """Weekly production required to earn ``desired_rate`` (col K in sheet).

        ``required = pph_for_rate(desired_rate) * scheduled_hours``.
        """
        return self.pph_for_rate(desired_rate) * scheduled_hours

    def get_daily_required_production(
        self, desired_rate: float, daily_hours: dict[str, float]
    ) -> dict[str, float]:
        """Per-day required production (cols D–J).

        Returns a dict keyed like ``daily_hours`` plus a ``"Week"`` total.
        """
        pph = self.pph_for_rate(desired_rate)
        result = {day: pph * hours for day, hours in daily_hours.items()}
        result["Week"] = sum(result.values())
        return result

    def min_expected_production(self, scheduled_hours: float) -> float:
        """The guarantee floor of production ("Min Exptd Svcs", cell N3).

        Uses the *exact* ``guarantee_rate / np_rate`` (not the rounded tier PPH),
        matching the workbook: 12 → 817.5, 13 → 910.
        """
        return self.guarantee_rate / self.np_rate * scheduled_hours

    # -- effective rate ----------------------------------------------------

    def get_effective_rate(
        self, achieved_pph: float, *, interpolate: bool = False, apply_guarantee: bool = True
    ) -> float:
        """Effective pay rate earned for an ``achieved_pph``.

        Method (documented in ``docs/pay-plan-logic.md``):

        * **Step (default):** the pay rate of the *highest tier whose
          ``pph_required <= achieved_pph``*. You must fully reach a tier's PPH to
          earn its rate — partial progress does not round up.
        * **Interpolate (opt-in):** linearly interpolate the pay rate between the
          two surrounding tiers, for a smooth "you're partway to the next tier"
          readout.

        In both modes the result is floored at ``guarantee_rate`` when
        ``apply_guarantee`` is true (a stylist never earns below guarantee).
        """
        tiers = self.tiers
        rate: float
        if achieved_pph < tiers[0].pph_required:
            # Below the lowest tier: only the guarantee applies.
            rate = self.guarantee_rate if apply_guarantee else 0.0
            return rate

        # Find the highest tier at/below achieved PPH.
        idx = 0
        for i, t in enumerate(tiers):
            if t.pph_required <= achieved_pph:
                idx = i
            else:
                break
        base = tiers[idx]

        if interpolate and idx + 1 < len(tiers) and achieved_pph > base.pph_required:
            nxt = tiers[idx + 1]
            span = nxt.pph_required - base.pph_required
            frac = (achieved_pph - base.pph_required) / span if span else 0.0
            rate = base.pay_rate + frac * (nxt.pay_rate - base.pay_rate)
        else:
            rate = base.pay_rate

        if apply_guarantee:
            rate = max(rate, self.guarantee_rate)
        return rate

    # -- pay projections ---------------------------------------------------

    def calculate_projected_week_pay(self, effective_rate: float, scheduled_hours: float) -> float:
        """Projected weekly pay (col M) = ``effective_rate * scheduled_hours``."""
        return effective_rate * scheduled_hours

    def weekly_pay_increment(self, desired_rate: float, scheduled_hours: float) -> float:
        """Weekly pay above the guarantee (col N)."""
        return self.calculate_projected_week_pay(
            desired_rate, scheduled_hours
        ) - self.calculate_projected_week_pay(self.guarantee_rate, scheduled_hours)

    def calculate_production_needed_to_sustain(
        self,
        desired_rate: float,
        scheduled_hours: float,
        production_so_far: float = 0.0,
        hours_remaining: float | None = None,
    ) -> dict[str, float]:
        """How much more production is needed to *sustain* ``desired_rate``.

        Handles the remaining-hours logic: given production banked so far (and,
        optionally, the hours left in the period), returns the total required,
        the remaining production still needed, and the PPH that implies over the
        remaining hours.
        """
        required_total = self.get_required_weekly_production(desired_rate, scheduled_hours)
        remaining_production = max(0.0, required_total - production_so_far)
        result = {
            "required_total": required_total,
            "production_so_far": production_so_far,
            "remaining_production": remaining_production,
        }
        if hours_remaining is not None:
            result["hours_remaining"] = hours_remaining
            result["required_pph_remaining"] = (
                remaining_production / hours_remaining if hours_remaining > 0 else 0.0
            )
        return result

    # -- service mix -------------------------------------------------------

    def suggest_service_mix(
        self, required_production: float, config: dict | None = None
    ) -> dict[str, float | dict[str, float]]:
        """Translate a production target into a service plan.

        Uses the workbook's per-service values (haircut ``$23``, color ``$85``,
        overridable via ``config``). Mirrors the sheet's two pure scenarios —
        "all haircuts" and "all colors" — and adds a configurable blended split
        (``config['haircut_share']`` of production to haircuts; default ``0.5``).

        Counts are returned both raw (fractional) and rounded **up** (you can't
        book a fraction of a service, and the sheet rounds haircuts up).
        """
        cfg = config or {}
        haircut_price = float(cfg.get("haircut_price", self.haircut_price))
        color_price = float(cfg.get("color_price", self.color_price))
        haircut_share = float(cfg.get("haircut_share", 0.5))

        all_haircuts = required_production / haircut_price if haircut_price else 0.0
        all_colors = required_production / color_price if color_price else 0.0

        hc_prod = required_production * haircut_share
        co_prod = required_production * (1 - haircut_share)
        blended = {
            "haircuts": hc_prod / haircut_price if haircut_price else 0.0,
            "colors": co_prod / color_price if color_price else 0.0,
        }

        return {
            "haircut_price": haircut_price,
            "color_price": color_price,
            "all_haircuts": all_haircuts,
            "all_haircuts_rounded": float(math.ceil(all_haircuts)),
            "all_colors": all_colors,
            "all_colors_rounded": float(math.ceil(all_colors)),
            "blended": blended,
        }

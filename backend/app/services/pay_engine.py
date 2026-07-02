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

See ``docs/pay-plan-logic.md`` for tiers, examples, and reconciliation notes
against ``PPH Based Payplan.xlsx``.
"""

from __future__ import annotations

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

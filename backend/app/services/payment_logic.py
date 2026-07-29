"""Global payment-logic service.

The single global :class:`~app.models.payment_logic.PaymentLogicConfig` row is
the source of truth for every calculation that produces the numbers shown to
users. This module owns:

* the **defaults** (seeded on first run from :mod:`app.services.pay_engine`),
* the **get-or-create** accessor that seeds the row on first access,
* an **engine factory** (delegates to :meth:`PayPlanEngine.from_config`),
* a plain-language **formula breakdown**, and
* a **preview** helper so the admin can see the impact of proposed changes on
  sample or real data before saving.

There are intentionally no per-salon or per-user overrides of these rules.
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.models.payment_logic import GLOBAL_CONFIG_ID, PaymentLogicConfig
from app.services import pay_engine


def default_tiers() -> list[dict[str, float]]:
    """The seed tier table, straight from ``pay_engine.DEFAULT_PPH_TIERS``."""
    return [
        {"pay_rate": float(rate), "pph_required": float(pph)}
        for rate, pph in pay_engine.DEFAULT_PPH_TIERS
    ]


def default_config_values() -> dict[str, Any]:
    """The seed values for the global config (current defaults)."""
    return {
        "tiers": default_tiers(),
        "np_rate": pay_engine.DEFAULT_NP_RATE,
        "np_percent": 0.195,
        "guarantee_rate": 12.0,
        "commission_rate": pay_engine.DEFAULT_NP_RATE,
        "haircut_price": pay_engine.DEFAULT_HAIRCUT_PRICE,
        "color_price": pay_engine.DEFAULT_COLOR_PRICE,
        "avg_ticket_haircut": pay_engine.DEFAULT_HAIRCUT_PRICE,
        "avg_ticket_color": pay_engine.DEFAULT_COLOR_PRICE,
        "service_mix_haircut": 0.6,
        "min_services_per_day": 6.0,
    }


def get_or_create_config(session: Session) -> PaymentLogicConfig:
    """Return the single global config row, seeding it on first access."""
    config = session.get(PaymentLogicConfig, GLOBAL_CONFIG_ID)
    if config is None:
        config = PaymentLogicConfig(id=GLOBAL_CONFIG_ID, **default_config_values())
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


def engine_for(config: PaymentLogicConfig) -> pay_engine.PayPlanEngine:
    """Build the Excel-accurate engine from the global config."""
    return pay_engine.PayPlanEngine.from_config(config)


def _sorted_tiers(config: PaymentLogicConfig) -> list[dict[str, float]]:
    return sorted(
        ({"pay_rate": float(t["pay_rate"]), "pph_required": float(t["pph_required"])}
         for t in (config.tiers or [])),
        key=lambda t: t["pay_rate"],
    )


def formula_breakdown(config: PaymentLogicConfig) -> dict[str, Any]:
    """A plain-language explanation of how the numbers are derived.

    Returns human-readable formula strings plus the concrete parameters they
    use, so a non-technical admin understands exactly what drives every
    displayed value.
    """
    tiers = _sorted_tiers(config)
    lowest = tiers[0] if tiers else {"pay_rate": config.guarantee_rate, "pph_required": 0.0}
    highest = tiers[-1] if tiers else lowest
    return {
        "summary": (
            "Every stylist's headline $/hr comes from their Production-Per-Hour "
            "(PPH). We look up PPH in the tier table below to find the pay rate "
            "they've earned, then never let it drop below the guarantee floor."
        ),
        "definitions": [
            {"term": "PPH (Production Per Hour)",
             "formula": "PPH = production ÷ hours worked",
             "explanation": "How much service revenue a stylist produces per hour."},
            {"term": "Effective pay rate ($/hr)",
             "formula": "rate = tier_lookup(PPH), floored at the guarantee",
             "explanation": "The highest tier whose required PPH the stylist has "
                            "fully reached. Never below the guarantee."},
            {"term": "Pay",
             "formula": "pay = effective_rate × hours worked",
             "explanation": "What the stylist earns for the period."},
            {"term": "Required production for a target rate",
             "formula": "required = pph_for(target_rate) × scheduled_hours",
             "explanation": "How much production is needed to hit a target $/hr."},
            {"term": "Off-tier PPH",
             "formula": f"pph = pay_rate ÷ NP rate ({config.np_rate})",
             "explanation": "For a rate that isn't an exact table row, PPH is "
                            "derived from the net-production (NP) rate."},
            {"term": "Guarantee floor as production",
             "formula": "min_production = (guarantee ÷ NP rate) × hours",
             "explanation": "The production equivalent of the guarantee."},
            {"term": "Service projection",
             "formula": (f"haircut = ${config.haircut_price}, "
                         f"color = ${config.color_price} of production each"),
             "explanation": "Production is translated into service counts using "
                            "these per-service prices."},
        ],
        "parameters": {
            "np_rate": config.np_rate,
            "np_percent": config.np_percent,
            "guarantee_rate": config.guarantee_rate,
            "commission_rate": config.commission_rate,
            "haircut_price": config.haircut_price,
            "color_price": config.color_price,
            "avg_ticket_haircut": config.avg_ticket_haircut,
            "avg_ticket_color": config.avg_ticket_color,
            "service_mix_haircut": config.service_mix_haircut,
            "min_services_per_day": config.min_services_per_day,
            "tier_count": len(tiers),
            "lowest_tier": lowest,
            "highest_tier": highest,
        },
    }


def preview(
    config: PaymentLogicConfig,
    *,
    production: float,
    hours: float,
    guarantee_rate: float | None = None,
    target_rate: float | None = None,
    scheduled_hours: float | None = None,
) -> dict[str, Any]:
    """Compute the user-facing numbers a given config would produce.

    Used by the preview endpoint so the admin can see the impact of proposed
    changes on sample or real data before saving. ``guarantee_rate`` defaults to
    the config's global guarantee.
    """
    eng = engine_for(config)
    gtd = float(guarantee_rate) if guarantee_rate is not None else float(config.guarantee_rate)
    eng.guarantee_rate = gtd

    pph = production / hours if hours > 0 else 0.0
    effective_rate = eng.get_effective_rate(pph) if hours > 0 else 0.0
    tier_rate_no_floor = eng.get_effective_rate(pph, apply_guarantee=False) if hours > 0 else 0.0
    pay = effective_rate * hours
    commission_pay = production * config.commission_rate
    guarantee_pay = gtd * hours

    result: dict[str, Any] = {
        "pph": round(pph, 2),
        "effective_rate": round(effective_rate, 2),
        "pay": round(pay, 2),
        "commission_pay": round(commission_pay, 2),
        "guarantee_pay": round(guarantee_pay, 2),
        "on_guarantee": hours > 0 and tier_rate_no_floor < gtd,
        "guarantee_rate": round(gtd, 2),
        "min_expected_production": round(eng.min_expected_production(scheduled_hours or hours), 2),
    }
    if target_rate is not None:
        sched = scheduled_hours if scheduled_hours is not None else hours
        required = eng.get_required_weekly_production(target_rate, sched)
        result["target_rate"] = round(float(target_rate), 2)
        result["required_production_for_target"] = round(required, 2)
        result["remaining_production_for_target"] = round(max(0.0, required - production), 2)
    return result

"""Unit tests for the pay engine — the source of truth for pay math."""

from __future__ import annotations

import math

import pytest
from app.services import pay_engine as pe


def make_config(**kwargs) -> pe.PayConfig:
    base = {"guarantee_rate": 16.0, "commission_rate": 0.42, "salon_guarantee": {"s1": 17.0}}
    base.update(kwargs)
    return pe.PayConfig(**base)


def test_guarantee_rate_override():
    cfg = make_config()
    assert pe.guarantee_rate_for("s1", cfg) == 17.0
    assert pe.guarantee_rate_for("unknown", cfg) == 16.0
    assert pe.guarantee_rate_for(None, cfg) == 16.0


def test_commission_beats_guarantee():
    cfg = make_config()
    r = pe.effective_pay(production=1000, hours=8, guarantee_rate=17, commission_rate=cfg.commission_rate)
    # commission = 420 vs guarantee = 136 -> commission wins
    assert r["pay"] == 420.0
    assert r["on_guarantee"] is False
    assert r["effective_rate"] == round(420 / 8, 2)
    assert r["pph"] == 125.0


def test_guarantee_floor_protects_low_producer():
    cfg = make_config()
    # commission = 200*0.42 = 84 vs guarantee = 8*17 = 136 -> guarantee wins
    r = pe.effective_pay(production=200, hours=8, guarantee_rate=17, commission_rate=cfg.commission_rate)
    assert r["pay"] == 136.0
    assert r["on_guarantee"] is True
    assert r["effective_rate"] == 17.0


def test_required_production_inverts_effective_rate():
    cfg = make_config()
    hours = 40
    target = 30
    req = pe.required_production(target, hours, cfg.commission_rate)
    # feeding that production back through must yield the target rate
    r = pe.effective_pay(production=req, hours=hours, guarantee_rate=16, commission_rate=cfg.commission_rate)
    assert math.isclose(r["effective_rate"], target, rel_tol=1e-6)


def test_what_if_remaining_and_projection():
    cfg = make_config(avg_ticket_haircut=48, avg_ticket_color=135, service_mix_haircut=0.6)
    res = pe.plan_what_if(
        target_rate=32,
        scheduled_hours=80,
        production_to_date=5000,
        remaining_days=3,
        config=cfg,
        guarantee_rate=17,
    )
    assert res["required_production"] == round(32 * 80 / 0.42, 2)
    assert res["remaining_production"] == round(res["required_production"] - 5000, 2)
    # projected services reconstruct remaining production via avg ticket
    avg_ticket = 0.6 * 48 + 0.4 * 135
    assert math.isclose(res["projected_services"] * avg_ticket, res["remaining_production"], rel_tol=0.02)
    assert res["below_guarantee"] is False


def test_what_if_below_guarantee_flag():
    cfg = make_config()
    res = pe.plan_what_if(
        target_rate=16,
        scheduled_hours=40,
        production_to_date=0,
        remaining_days=5,
        config=cfg,
        guarantee_rate=17,
    )
    assert res["below_guarantee"] is True


def test_tiered_rate_lookup():
    tiers = [(0, 15.0), (50, 22.0), (80, 30.0), (110, 38.0)]
    assert pe.tiered_rate(10, tiers) == 15.0
    assert pe.tiered_rate(60, tiers) == 22.0
    assert pe.tiered_rate(95, tiers) == 30.0
    assert pe.tiered_rate(200, tiers) == 38.0


# ─────────────────────────────────────────────────────────────────────────────
#  PayPlanEngine — asserts the client's NEW rules (UAT 2.xlsx "OtherData" +
#  "Holliean" tab). Tier table: PPH → Pay Rate at Pay Rate = PPH × 0.40.
# ─────────────────────────────────────────────────────────────────────────────

# The client's tier table (pay_rate -> pph_required), pay_rate = pph * 0.40.
CLIENT_TIERS = {
    8: 20, 9: 22.5, 10: 25, 11: 27.5, 12: 30, 13: 32.5, 14: 35,
    15: 37.5, 16: 40, 17: 42.5, 18: 45, 19: 47.5, 20: 50,
}


def holliean_engine() -> pe.PayPlanEngine:
    """Holliean example: guarantee $10."""
    return pe.PayPlanEngine(guarantee_rate=10)


def test_default_tiers_match_client_table():
    eng = pe.PayPlanEngine()
    assert [(t.pay_rate, t.pph_required) for t in eng.tiers] == [
        (8.0, 20.0), (9.0, 22.5), (10.0, 25.0), (11.0, 27.5), (12.0, 30.0),
        (13.0, 32.5), (14.0, 35.0), (15.0, 37.5), (16.0, 40.0), (17.0, 42.5),
        (18.0, 45.0), (19.0, 47.5), (20.0, 50.0),
    ]


def test_tier_table_obeys_np_rate_relationship():
    # Every tier threshold is pay_rate / 0.40.
    for rate, pph in CLIENT_TIERS.items():
        assert pph == pytest.approx(rate / 0.4)


def test_pph_for_rate_rounds_up_to_nearest_dollar():
    eng = holliean_engine()
    # DPR / 0.40 rounded UP: $14 -> 35 (exact), $9 -> ceil(22.5) = 23.
    assert eng.pph_for_rate(14) == 35
    assert eng.pph_for_rate(9) == 23
    assert eng.pph_for_rate(15) == 38  # ceil(37.5)
    assert eng.pph_for_rate(8) == 20


def test_load_tiers_returns_default_and_is_deterministic():
    eng = pe.PayPlanEngine()
    tiers = eng.load_tiers(salon_id=999)
    assert [(t.pay_rate, t.pph_required) for t in tiers][:3] == [(8, 20), (9, 22.5), (10, 25)]


def test_holliean_required_service_revenue():
    """Holliean: DPR $14, 21 scheduled hours -> Req PPH 35, Req Svc Rev $735."""
    eng = holliean_engine()
    assert eng.pph_for_rate(14) == 35
    assert eng.get_required_weekly_production(14, 21) == pytest.approx(735.0)


def test_daily_required_production_holliean():
    eng = holliean_engine()
    # DPR 14 -> PPH 35. A 3-day split of 21 hours.
    daily = eng.get_daily_required_production(14, {"Mo": 7, "Tu": 7, "We": 7})
    assert daily == pytest.approx({"Mo": 245.0, "Tu": 245.0, "We": 245.0, "Week": 735.0})


def test_min_expected_production_uses_guarantee_over_np():
    # Holliean guarantee $10 over 21 hours -> (10 / 0.40) * 21 = 525.
    assert holliean_engine().min_expected_production(21) == pytest.approx(525.0)


def test_projected_week_pay():
    eng = holliean_engine()
    assert eng.calculate_projected_week_pay(14, 21) == pytest.approx(294.0)  # 14 * 21
    assert eng.calculate_projected_week_pay(10, 21) == pytest.approx(210.0)


def test_weekly_pay_increment_over_guarantee():
    eng = holliean_engine()  # guarantee 10
    assert eng.weekly_pay_increment(14, 21) == pytest.approx((14 - 10) * 21)  # 84


def test_effective_rate_step_lookup():
    eng = holliean_engine()  # guarantee 10
    assert eng.get_effective_rate(25) == 10  # exactly tier 25 -> $10
    assert eng.get_effective_rate(34) == 13  # 32.5 <= 34 < 35 -> $13
    assert eng.get_effective_rate(35) == 14
    assert eng.get_effective_rate(49.9) == 19  # just under 50
    assert eng.get_effective_rate(50) == 20
    assert eng.get_effective_rate(500) == 20  # capped at top tier


def test_effective_rate_respects_guarantee_floor():
    eng = pe.PayPlanEngine(guarantee_rate=12)
    # PPH 25 maps to tier rate 10, but guarantee 12 floors it.
    assert eng.get_effective_rate(25) == 12
    # Below the lowest tier PPH -> guarantee only.
    assert eng.get_effective_rate(10) == 12
    assert holliean_engine().get_effective_rate(10) == 10


def test_effective_rate_interpolation():
    eng = pe.PayPlanEngine(guarantee_rate=0)
    # Halfway between PPH 30 (rate 12) and PPH 32.5 (rate 13) -> 12.5.
    assert eng.get_effective_rate(31.25, interpolate=True) == pytest.approx(12.5)
    # Exact tier value is unchanged by interpolation.
    assert eng.get_effective_rate(32.5, interpolate=True) == pytest.approx(13.0)


def test_production_needed_to_sustain_with_remaining_hours():
    eng = holliean_engine()
    res = eng.calculate_production_needed_to_sustain(
        desired_rate=14, scheduled_hours=21, production_so_far=300.0, hours_remaining=10.0
    )
    assert res["required_total"] == pytest.approx(735.0)
    assert res["remaining_production"] == pytest.approx(435.0)
    assert res["required_pph_remaining"] == pytest.approx(43.5)
    # Already past target -> nothing remaining.
    done = eng.calculate_production_needed_to_sustain(14, 21, production_so_far=800.0)
    assert done["remaining_production"] == 0.0


def test_suggest_service_mix_uses_23_and_85():
    eng = holliean_engine()
    mix = eng.suggest_service_mix(735.0)
    assert mix["haircut_price"] == 23.0
    assert mix["color_price"] == 85.0
    assert mix["all_haircuts"] == pytest.approx(735.0 / 23)   # ~31.96
    assert mix["all_colors"] == pytest.approx(735.0 / 85)     # ~8.65
    assert mix["all_haircuts_rounded"] == 32.0
    assert mix["all_colors_rounded"] == 9.0
    # Blended 50/50 of production.
    assert mix["blended"]["haircuts"] == pytest.approx((735.0 * 0.5) / 23)
    assert mix["blended"]["colors"] == pytest.approx((735.0 * 0.5) / 85)

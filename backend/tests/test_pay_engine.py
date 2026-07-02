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
#  PayPlanEngine — asserts EXACT values from PPH Based Payplan.xlsx
# ─────────────────────────────────────────────────────────────────────────────

# Worked examples straight out of the workbook.
SCHED_HOURS = {"Mo": 5.25, "Tu": 6.25, "We": 5.25, "Th": 5.25, "Fr": 5.25, "Sa": 0.0, "Su": 0.0}
SCHED_TOTAL = 27.25  # cell I3, "Sched View" (guarantee 12)
ACTUAL_HOURS = {"Mo": 3.0, "Tu": 5.0, "We": 4.0, "Th": 4.0, "Fr": 6.0, "Sa": 6.0, "Su": 0.0}
ACTUAL_TOTAL = 28.0  # cell I3, "Actual" (guarantee 13)

# Full tier table (cols B & C), identical on both sheets.
EXCEL_TIERS = {
    11: 28, 12: 30, 13: 33, 14: 35, 15: 38, 16: 40, 17: 43, 18: 45, 19: 48,
    20: 50, 21: 53, 22: 55, 23: 58, 24: 60, 25: 63, 26: 65, 27: 68, 28: 70, 29: 73,
}
# Weekly required production (col K) — "Sched View" @ 27.25h.
SCHED_WEEKLY_K = {
    12: 817.5, 13: 899.25, 14: 953.75, 15: 1035.5, 16: 1090.0, 17: 1171.75,
    18: 1226.25, 19: 1308.0, 20: 1362.5, 21: 1444.25, 22: 1498.75, 23: 1580.5,
    24: 1635.0, 25: 1716.75, 26: 1771.25, 27: 1853.0, 28: 1907.5, 29: 1989.25,
}
# Weekly required production (col K) — "Actual" @ 28h.
ACTUAL_WEEKLY_K = {
    13: 924.0, 14: 980.0, 15: 1064.0, 16: 1120.0, 17: 1204.0, 18: 1260.0,
    19: 1344.0, 20: 1400.0, 21: 1484.0, 22: 1540.0, 23: 1624.0, 24: 1680.0,
    25: 1764.0, 26: 1820.0, 27: 1904.0, 28: 1960.0, 29: 2044.0,
}


def sched_engine() -> pe.PayPlanEngine:
    return pe.PayPlanEngine(guarantee_rate=12)


def actual_engine() -> pe.PayPlanEngine:
    return pe.PayPlanEngine(guarantee_rate=13)


def test_tier_table_matches_excel():
    eng = sched_engine()
    for rate, pph in EXCEL_TIERS.items():
        assert eng.pph_for_rate(rate) == pph, f"rate {rate}"


def test_pph_for_off_tier_rate_uses_exact_np():
    eng = sched_engine()
    assert eng.pph_for_rate(12.5) == pytest.approx(31.25)  # 12.5 / 0.4


def test_load_tiers_returns_default_and_is_deterministic():
    eng = pe.PayPlanEngine(guarantee_rate=12)
    tiers = eng.load_tiers(salon_id=999)
    assert [(t.pay_rate, t.pph_required) for t in tiers][:3] == [(11, 28), (12, 30), (13, 33)]


def test_required_weekly_production_sched_view():
    eng = sched_engine()
    for rate, expected in SCHED_WEEKLY_K.items():
        assert eng.get_required_weekly_production(rate, SCHED_TOTAL) == pytest.approx(expected), rate


def test_required_weekly_production_actual():
    eng = actual_engine()
    for rate, expected in ACTUAL_WEEKLY_K.items():
        assert eng.get_required_weekly_production(rate, ACTUAL_TOTAL) == pytest.approx(expected), rate


def test_daily_required_production_sched_rate12():
    eng = sched_engine()
    daily = eng.get_daily_required_production(12, SCHED_HOURS)  # PPH 30
    assert daily == pytest.approx(
        {"Mo": 157.5, "Tu": 187.5, "We": 157.5, "Th": 157.5, "Fr": 157.5, "Sa": 0.0, "Su": 0.0, "Week": 817.5}
    )


def test_daily_required_production_actual_rate13():
    eng = actual_engine()
    daily = eng.get_daily_required_production(13, ACTUAL_HOURS)  # PPH 33
    assert daily == pytest.approx(
        {"Mo": 99.0, "Tu": 165.0, "We": 132.0, "Th": 132.0, "Fr": 198.0, "Sa": 198.0, "Su": 0.0, "Week": 924.0}
    )


def test_min_expected_production_matches_N3():
    # "Sched View" N3 = 818 (817.5 rounded); "Actual" N3 = 910 exactly.
    assert sched_engine().min_expected_production(SCHED_TOTAL) == pytest.approx(817.5)
    assert round(sched_engine().min_expected_production(SCHED_TOTAL)) == 818
    assert actual_engine().min_expected_production(ACTUAL_TOTAL) == pytest.approx(910.0)


def test_projected_week_pay_matches_col_M():
    eng = sched_engine()
    assert eng.calculate_projected_week_pay(12, SCHED_TOTAL) == pytest.approx(327.0)
    assert eng.calculate_projected_week_pay(13, SCHED_TOTAL) == pytest.approx(354.25)
    assert eng.calculate_projected_week_pay(16, SCHED_TOTAL) == pytest.approx(436.0)
    a = actual_engine()
    assert a.calculate_projected_week_pay(13, ACTUAL_TOTAL) == pytest.approx(364.0)
    assert a.calculate_projected_week_pay(16, ACTUAL_TOTAL) == pytest.approx(448.0)


def test_weekly_pay_increment_matches_col_N():
    eng = sched_engine()  # guarantee 12
    assert eng.weekly_pay_increment(13, SCHED_TOTAL) == pytest.approx(27.25)
    assert eng.weekly_pay_increment(14, SCHED_TOTAL) == pytest.approx(54.5)
    assert eng.weekly_pay_increment(16, SCHED_TOTAL) == pytest.approx(109.0)
    a = actual_engine()  # guarantee 13
    assert a.weekly_pay_increment(14, ACTUAL_TOTAL) == pytest.approx(28.0)
    assert a.weekly_pay_increment(15, ACTUAL_TOTAL) == pytest.approx(56.0)
    assert a.weekly_pay_increment(16, ACTUAL_TOTAL) == pytest.approx(84.0)


def test_effective_rate_step_lookup():
    eng = sched_engine()  # guarantee 12
    assert eng.get_effective_rate(30) == 12
    assert eng.get_effective_rate(32) == 12  # not enough for tier 13 (needs 33)
    assert eng.get_effective_rate(33) == 13
    assert eng.get_effective_rate(40) == 16
    assert eng.get_effective_rate(41) == 16
    assert eng.get_effective_rate(73) == 29
    assert eng.get_effective_rate(500) == 29  # capped at top tier


def test_effective_rate_respects_guarantee_floor():
    eng13 = actual_engine()  # guarantee 13
    # PPH 30 maps to tier rate 12, but guarantee floors it at 13.
    assert eng13.get_effective_rate(30) == 13
    # Below the lowest tier PPH -> guarantee only.
    assert eng13.get_effective_rate(10) == 13
    assert sched_engine().get_effective_rate(10) == 12


def test_effective_rate_interpolation():
    eng = sched_engine()
    # Halfway between PPH 30 (rate 12) and PPH 33 (rate 13) -> 12.5.
    assert eng.get_effective_rate(31.5, interpolate=True) == pytest.approx(12.5)
    # Exact tier value is unchanged by interpolation.
    assert eng.get_effective_rate(33, interpolate=True) == pytest.approx(13.0)


def test_production_needed_to_sustain_with_remaining_hours():
    eng = sched_engine()
    res = eng.calculate_production_needed_to_sustain(
        desired_rate=16, scheduled_hours=SCHED_TOTAL, production_so_far=500.0, hours_remaining=10.0
    )
    assert res["required_total"] == pytest.approx(1090.0)
    assert res["remaining_production"] == pytest.approx(590.0)
    assert res["required_pph_remaining"] == pytest.approx(59.0)
    # Already past target -> nothing remaining.
    done = eng.calculate_production_needed_to_sustain(16, SCHED_TOTAL, production_so_far=1200.0)
    assert done["remaining_production"] == 0.0


def test_suggest_service_mix_uses_23_and_85():
    eng = sched_engine()
    mix = eng.suggest_service_mix(817.5)
    assert mix["haircut_price"] == 23.0
    assert mix["color_price"] == 85.0
    assert mix["all_haircuts"] == pytest.approx(817.5 / 23)   # ~35.54
    assert mix["all_colors"] == pytest.approx(817.5 / 85)     # ~9.62
    assert mix["all_haircuts_rounded"] == 36.0
    assert mix["all_colors_rounded"] == 10.0
    # Blended 50/50 of production.
    assert mix["blended"]["haircuts"] == pytest.approx((817.5 * 0.5) / 23)
    assert mix["blended"]["colors"] == pytest.approx((817.5 * 0.5) / 85)

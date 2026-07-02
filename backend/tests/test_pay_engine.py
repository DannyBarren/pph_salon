"""Unit tests for the pay engine — the source of truth for pay math."""

from __future__ import annotations

import math

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

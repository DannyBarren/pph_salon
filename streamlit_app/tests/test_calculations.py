"""Golden-case tests: the engine must reproduce ``PPH Based Payplan.xlsx`` exactly.

Rebeca = "Sched View" sheet (guarantee $12, 27.25 hrs).
Steph  = "Actual" sheet    (guarantee $13, 28 hrs).

Run with:  pytest streamlit_app/tests/  (or: python -m streamlit_app.tests.test_calculations)
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calculations as calc  # noqa: E402

# Daily scheduled hours (Mon..Sun).
REBECA_HOURS = [5.25, 6.25, 5.25, 5.25, 5.25, 0.0, 0.0]  # total 27.25, guarantee 12
STEPH_HOURS = [3.0, 5.0, 4.0, 4.0, 6.0, 6.0, 0.0]  # total 28, guarantee 13


def test_pph_uses_excel_half_up_rounding():
    # 13/0.4 = 32.5 → Excel rounds up to 33 (Python's round would give 32).
    assert calc.pph_for_rate(13) == 33
    assert calc.pph_for_rate(11) == 28
    assert calc.pph_for_rate(12) == 30
    assert calc.pph_for_rate(16) == 40
    assert calc.pph_for_rate(29) == 73


def test_rebeca_sched_view_weekly_values():
    g, hrs = 12, sum(REBECA_HOURS)  # 27.25
    assert calc.weekly_required(12, g, hrs) == 817.5  # K10
    assert calc.weekly_required(13, g, hrs) == 899.25  # K11
    assert calc.weekly_required(16, g, hrs) == 1090.0  # K14
    assert calc.min_expected_production(g, hrs) == 818  # N3
    # Wkly Svcs Incr (col L)
    assert calc.weekly_svcs_incr(12, g, hrs) == 0  # at guarantee → 0
    assert calc.weekly_svcs_incr(13, g, hrs) == 81.25  # L11
    assert calc.weekly_svcs_incr(16, g, hrs) == 272.0  # L14
    # Wkly Pay (col M) + Wkly Pay Incr (col N)
    assert calc.weekly_pay(12, g, hrs) == 327.0  # M10
    assert calc.weekly_pay(13, g, hrs) == 354.25  # M11
    assert calc.weekly_pay(16, g, hrs) == 436.0  # M14
    assert calc.weekly_pay_incr(13, g, hrs) == 27.25  # N11
    assert calc.weekly_pay_incr(16, g, hrs) == 109.0  # N14


def test_rebeca_daily_targets_rate13():
    # Rate 13 (PPH 33) daily targets = 33 × daily hours.
    dt = calc.daily_targets(13, 12, REBECA_HOURS)
    assert dt == [173.25, 206.25, 173.25, 173.25, 173.25, 0.0, 0.0]
    assert round(sum(dt), 2) == 899.25


def test_rebeca_below_guarantee_is_zeroed():
    # Rate 11 is below the $12 guarantee → all zeros (rows are inactive).
    assert calc.weekly_required(11, 12, sum(REBECA_HOURS)) == 0
    assert calc.weekly_pay(11, 12, sum(REBECA_HOURS)) == 0
    assert calc.daily_targets(11, 12, REBECA_HOURS) == [0.0] * 7


def test_steph_actual_weekly_values():
    g, hrs = 13, sum(STEPH_HOURS)  # 28
    assert calc.weekly_required(13, g, hrs) == 924.0  # K11
    assert calc.weekly_required(14, g, hrs) == 980.0  # K12
    assert calc.weekly_required(16, g, hrs) == 1120.0  # K14
    assert calc.min_expected_production(g, hrs) == 910  # N3
    assert calc.weekly_svcs_incr(13, g, hrs) == 0  # at guarantee
    assert calc.weekly_svcs_incr(14, g, hrs) == 70.0  # L12 (980 − 910)
    assert calc.weekly_svcs_incr(16, g, hrs) == 210.0  # L14
    assert calc.weekly_pay(13, g, hrs) == 364.0  # M11
    assert calc.weekly_pay(14, g, hrs) == 392.0  # M12
    assert calc.weekly_pay_incr(14, g, hrs) == 28.0  # N12
    assert calc.weekly_pay_incr(16, g, hrs) == 84.0  # N14


def test_steph_daily_targets_rate13():
    dt = calc.daily_targets(13, 13, STEPH_HOURS)  # PPH 33
    assert dt == [99.0, 165.0, 132.0, 132.0, 198.0, 198.0, 0.0]
    assert sum(dt) == 924.0


def test_np_percent_is_19_5():
    assert round(calc.np_percent(active=True), 3) == 0.195


def test_service_counts_23_and_85():
    # 817.5 production → 36 haircuts (all cuts) or 10 colors (all colors).
    assert calc.haircuts_for_production(817.5) == 36  # ceil(817.5/23)
    assert calc.colors_for_production(817.5) == 10  # ceil(817.5/85)


def test_performance_summary_and_over_short():
    # Steph made $1086 over 28 worked hours (guarantee 13).
    s = calc.summarize_performance(
        scheduled_hours=28, hours_worked=28, production=1086, guarantee_rate=13
    )
    assert round(s.current_pph, 2) == round(1086 / 28, 2)  # ≈ 38.79
    # PPH 38.79 → highest tier with PPH ≤ 38.79 is rate 15 (PPH 38).
    assert s.earned_pay_rate == 15
    assert s.weeks_pay_at_current_pph == 15 * 28  # 420, above guarantee 364
    assert s.min_expected == 910
    assert s.over_short_vs_min == 1086 - 910  # +176 over
    assert calc.over_short(900, 924) == -24  # short example


def test_zero_hours_week_is_safe():
    s = calc.summarize_performance(
        scheduled_hours=0, hours_worked=0, production=0, guarantee_rate=12
    )
    assert s.current_pph == 0
    assert s.weeks_pay_at_current_pph == 0
    assert s.min_expected == 0


if __name__ == "__main__":
    # Allow running directly without pytest.
    import traceback

    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

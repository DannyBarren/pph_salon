# PPH Pay Plan — Calculation Logic

> **Canonical source:** [`spec/PPH Based Payplan.xlsx`](./spec/PPH%20Based%20Payplan.xlsx)
> (sheets **Sched View** and **Actual**) and [`spec/PPH Stylist App.pdf`](./spec/).
>
> **Authoritative implementation:**
> [`backend/app/services/pay_engine.py`](../backend/app/services/pay_engine.py) →
> class `PayPlanEngine`, with exact-value regression tests in
> [`backend/tests/test_pay_engine.py`](../backend/tests/test_pay_engine.py).
> The frontend planner and the module's older functional helpers use a
> simplified flat-commission approximation and should be reconciled to this
> tiered model over time.

## 1. Concepts & terminology

| Term | Meaning |
| --- | --- |
| **Production** | Dollar value of services performed. |
| **PPH (Production Per Hour)** | `production / hours`. The metric the plan is built on. |
| **Pay rate** | The stylist's `$/hr`. |
| **Guarantee rate** | Minimum `$/hr` regardless of production (a floor). The two worked examples use `12` (Sched View) and `13` (Actual). |
| **NP rate** | Net-production share, `0.4` (cell `B6`). Ties pay rate to PPH: `pay_rate = PPH × 0.4`. |
| **Scheduled hours** | Rostered hours (**Sched View**). **Actual hours** = worked hours (**Actual**). |
| **Min Expected Svcs** | The guarantee floor expressed as production (cell `N3`). |

## 2. The tier table (hardcoded from the Excel)

Each pay rate requires a specific PPH. This table is **identical on both
sheets** (columns B & C) and is hardcoded in `DEFAULT_PPH_TIERS`:

| Pay rate | PPH req | Pay rate | PPH req | Pay rate | PPH req |
| --- | --- | --- | --- | --- | --- |
| 11 | 28 | 18 | 45 | 25 | 63 |
| 12 | 30 | 19 | 48 | 26 | 65 |
| 13 | 33 | 20 | 50 | 27 | 68 |
| 14 | 35 | 21 | 53 | 28 | 70 |
| 15 | 38 | 22 | 55 | 29 | 73 |
| 16 | 40 | 23 | 58 | | |
| 17 | 43 | 24 | 60 | | |

The underlying relationship is `pay_rate = round_half_up(PPH × 0.4)`
(equivalently `PPH ≈ pay_rate ÷ 0.4 = pay_rate × 2.5`). The table is stored
explicitly so results match the workbook exactly and can later be replaced by
per-salon, DB-backed tiers via `PayPlanEngine.load_tiers(salon_id)`.

## 3. Core formulas

```
pph_required(rate)              = tier lookup   (exact table value)
required_weekly_production(r,h) = pph_required(r) × scheduled_hours          # col K
daily_required_production(r)[d] = pph_required(r) × daily_hours[d]           # cols D–J
projected_week_pay(rate, h)     = rate × scheduled_hours                     # col M
weekly_pay_increment(rate, h)   = (rate − guarantee) × scheduled_hours       # col N
min_expected_production(h)      = guarantee ÷ 0.4 × scheduled_hours          # cell N3
```

> ⚠️ **Subtle but verified:** `required_weekly_production` uses the **rounded
> tier PPH** (e.g. rate 13 → PPH 33 → `33 × 27.25 = 899.25`), while
> `min_expected_production` uses the **exact** `guarantee ÷ 0.4` (e.g. guarantee
> 13 → `32.5 × 28 = 910`, not `33 × 28`). Both behaviours match the sheet.

### To sustain a rate (remaining-hours logic)

```
remaining_production   = max(0, required_weekly_production − production_so_far)
required_pph_remaining = remaining_production ÷ hours_remaining
```

## 4. Effective rate calculation (method)

Given an **achieved PPH**, `get_effective_rate()` returns the pay rate earned:

1. **Step (default).** Take the pay rate of the **highest tier whose
   `pph_required ≤ achieved_pph`**. You must fully reach a tier's PPH to earn
   its rate — being partway does not round up. (e.g. PPH 32 → rate 12, since
   tier 13 needs PPH 33; PPH 40 → rate 16.)
2. **Interpolate (opt-in).** Linearly interpolate the rate between the two
   surrounding tiers for a smooth "progress to next tier" readout (e.g. PPH 31.5
   → 12.5).
3. **Guarantee floor.** In both modes the result is floored at the guarantee
   rate — a stylist never earns below guarantee (e.g. with guarantee 13, PPH 30
   maps to tier rate 12 but returns 13).

## 5. Service mix (`suggest_service_mix`)

Per-service production values from the workbook (cells `T6` / `AC6`):
**haircut = `$23`**, **color = `$85`**. Given a production target the engine
returns the two pure scenarios (all-haircuts, all-colors — counts rounded up)
plus a configurable blended split. Example for `$817.5`:

- all haircuts → `817.5 / 23 ≈ 35.5` → **36**
- all colors → `817.5 / 85 ≈ 9.6` → **10**

> The workbook's per-day haircut/color helper columns (Q–AG) contain an
> off-by-one row shift (they reference the next tier's production because
> sub-guarantee rows are zeroed). We deliberately **do not** reproduce that
> artifact; `suggest_service_mix` uses the straightforward `production ÷ price`.

## 6. Worked examples (encoded as tests)

**Sched View** — guarantee `12`, scheduled `27.25h`, daily
`Mo 5.25 / Tu 6.25 / We 5.25 / Th 5.25 / Fr 5.25`:

| Rate | PPH | Weekly req (K) | Weekly pay (M) | Incr (N) |
| --- | --- | --- | --- | --- |
| 12 | 30 | 817.50 | 327.00 | 0 |
| 13 | 33 | 899.25 | 354.25 | 27.25 |
| 16 | 40 | 1090.00 | 436.00 | 109.00 |

Min expected = `12 ÷ 0.4 × 27.25 = 817.5 (≈818)`.

**Actual** — guarantee `13`, scheduled `28h`, daily
`Mo 3 / Tu 5 / We 4 / Th 4 / Fr 6 / Sa 6`:

| Rate | PPH | Weekly req (K) | Weekly pay (M) | Incr (N) |
| --- | --- | --- | --- | --- |
| 13 | 33 | 924.00 | 364.00 | 0 |
| 14 | 35 | 980.00 | 392.00 | 28.00 |
| 16 | 40 | 1120.00 | 448.00 | 84.00 |

Min expected = `13 ÷ 0.4 × 28 = 910`. Daily for rate 13:
`Mo 99 / Tu 165 / We 132 / Th 132 / Fr 198 / Sa 198` (= 924 total).

These exact values are asserted in `backend/tests/test_pay_engine.py`.

## 7. Configurable / extensible

- `PayPlanEngine(guarantee_rate, np_rate, haircut_price, color_price, tiers, salon_tiers)`
  — everything is injectable; nothing is hard-coded at call sites.
- **DB-backed tiers:** populate `salon_tiers` or override
  `load_tiers(salon_id)` to read from a repository. No other method changes.

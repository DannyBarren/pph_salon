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

## 2. The tier table (seeded default — client `OtherData`)

Each pay rate requires a specific PPH. The seeded default comes from the
client's `OtherData` sheet (UAT 2.xlsx) and is stored in `DEFAULT_PPH_TIERS`.
It is **global**: the highest admin (Owner) edits it at `/admin/payment-logic`
and there are no per-salon overrides.

| PPH req | Pay rate | PPH req | Pay rate | PPH req | Pay rate |
| --- | --- | --- | --- | --- | --- |
| 20 | 8 | 32.5 | 13 | 45 | 18 |
| 22.5 | 9 | 35 | 14 | 47.5 | 19 |
| 25 | 10 | 37.5 | 15 | 50 | 20 |
| 27.5 | 11 | 40 | 16 | | |
| 30 | 12 | 42.5 | 17 | | |

The exact relationship is `pay_rate = PPH × 0.4` (equivalently
`PPH = pay_rate ÷ 0.4 = pay_rate × 2.5`), so thresholds can be fractional (e.g.
$9/hr ⇒ 22.5 PPH). The **Required PPH for a Desired Pay Rate** rounds UP to the
nearest whole dollar: `ceil(rate ÷ 0.4)`.

## 3. Core formulas

```
pph_required(rate)              = ceil(rate ÷ 0.4)   (round UP to nearest $)
required_weekly_production(r,h) = pph_required(r) × scheduled_hours          # Req Svc Rev
daily_required_production(r)[d] = pph_required(r) × daily_hours[d]           # daily targets
projected_week_pay(rate, h)     = rate × scheduled_hours
weekly_pay_increment(rate, h)   = (rate − guarantee) × scheduled_hours
min_expected_production(h)      = guarantee ÷ 0.4 × scheduled_hours
```

> **Holliean example:** guarantee $10, DPR $14, 21 scheduled hours →
> `pph_required(14) = ceil(35) = 35`, `required_weekly_production = 35 × 21 = 735`,
> `min_expected_production = (10 ÷ 0.4) × 21 = 525`.
>
> ⚠️ `required_weekly_production` uses the **rounded-up** required PPH, while
> `min_expected_production` uses the **exact** `guarantee ÷ 0.4`. At a fractional
> tier (e.g. rate 9) the rounded target (23 PPH) sits just above the tier
> threshold (22.5 PPH) — intended.

### To sustain a rate (remaining-hours logic)

```
remaining_production   = max(0, required_weekly_production − production_so_far)
required_pph_remaining = remaining_production ÷ hours_remaining
```

## 4. Effective rate calculation (method)

Given an **achieved PPH**, `get_effective_rate()` returns the pay rate earned:

1. **Step (default).** Take the pay rate of the **highest tier whose
   `pph_required ≤ achieved_pph`**. You must fully reach a tier's PPH to earn
   its rate — being partway does not round up. (e.g. PPH 34 → rate 13, since
   tier 14 needs PPH 35; PPH 40 → rate 16.)
2. **Interpolate (opt-in).** Linearly interpolate the rate between the two
   surrounding tiers for a smooth "progress to next tier" readout (e.g. PPH
   31.25 → 12.5, halfway between tier 12 @ 30 and tier 13 @ 32.5).
3. **Guarantee floor.** In both modes the result is floored at the guarantee
   rate — a stylist never earns below guarantee (e.g. with guarantee 13, PPH 30
   maps to tier rate 12 but returns 13).

## 5. Service mix (`suggest_service_mix`)

Per-service production values (client Avg Haircut / Avg Color):
**haircut = `$23`**, **color = `$85`**. Given a production target the engine
returns the two pure scenarios (all-haircuts, all-colors — counts rounded up)
plus a configurable blended split. Example for the Holliean target `$735`:

- all haircuts → `735 / 23 ≈ 31.96` → **32**
- all colors → `735 / 85 ≈ 8.65` → **9**

> The workbook's per-day haircut/color helper columns (Q–AG) contain an
> off-by-one row shift (they reference the next tier's production because
> sub-guarantee rows are zeroed). We deliberately **do not** reproduce that
> artifact; `suggest_service_mix` uses the straightforward `production ÷ price`.

## 6. Worked example (encoded as tests)

**Holliean** — guarantee `$10`, scheduled `21h`:

| DPR | Req PPH `ceil(rate/0.4)` | Req Svc Rev | Weekly pay | Incr |
| --- | --- | --- | --- | --- |
| 10 | 25 | 525.00 | 210.00 | 0 |
| 14 | 35 | 735.00 | 294.00 | 84.00 |

Min expected = `10 ÷ 0.4 × 21 = 525`. Service mix for `$735`:
all-haircuts `ceil(735/23) = 32`, all-colors `ceil(735/85) = 9`.

These exact values are asserted in `backend/tests/test_pay_engine.py`.

## 7. Configurable / extensible

- `PayPlanEngine(guarantee_rate, np_rate, haircut_price, color_price, tiers)`
  — everything is injectable; nothing is hard-coded at call sites. Build one from
  the global config with `PayPlanEngine.from_config(config)`.
- **Global config:** the single `PaymentLogicConfig` row is the source of truth
  (seeded from `DEFAULT_PPH_TIERS`). Payment logic is global — there are no
  per-salon tier overrides; `load_tiers()` returns the global table. The highest
  admin (Owner) edits everything at `/admin/payment-logic`.

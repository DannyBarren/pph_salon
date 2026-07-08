# Payment Logic — Backend Math & Calculation Reference (`payment_logic`)

> A complete, precise explanation of **all** the math, calculations, and logic in
> the **backend** that produces payment figures, revenue/production metrics, pay
> rates (PPH), pay increments, and goal targets — plus the results of a full
> accuracy check against the client's spreadsheet (`docs/spec/PPH Based Payplan.xlsx`).
>
> Documentation only (not shown in the app UI). Companion to `client_readme.md`.

---

## 0. Accuracy check — results first

A row-by-row verification compared the backend engine (and the Streamlit engine)
against **every active cell** of both spreadsheet sheets — **Sched View** (Rebeca,
guarantee $12, 27.25 hrs) and **Actual** (Steph, guarantee $13, 28 hrs) — covering
PPH, weekly required production (K), weekly services increment (L), weekly pay (M),
weekly pay increment (N), min-expected (N3), all daily targets (D–J), service
pricing, and the effective-rate tier lookup.

```
================ RESULT: 857 passed, 0 failed ================
```

Supporting suites (all green at time of writing):
- Backend: `pytest` → **55 passed**, `ruff` clean.
- Streamlit engine: `pytest` → **10 golden-case tests passed**.
- Frontend calc mirrors: `node --test` → **16 passed**.

**Conclusion:** the tiered pay engine reproduces the client spreadsheet exactly
(to the cent) for both worked examples across all pay-rate tiers.

> The verification method and the exact cells checked are described in
> [§10](#10-verification-methodology).

---

## 1. Where payment logic lives in the backend

There are **two layers** in `backend/app/services/pay_engine.py`, plus two
supporting services. Read this table first — it prevents confusion:

| Component | Model | Excel-accurate? | Used by |
| --- | --- | --- | --- |
| **`PayPlanEngine`** (class) | **Tiered** (`PPH = rate / 0.4`, tier table) | ✅ **Yes — verified 857/857** | The authoritative reference engine; the source of truth for tier math. |
| **Functional helpers** (`effective_pay`, `plan_what_if`, `required_production`) | **Flat commission** (`pay = production × commission_rate`, default `0.42`) | ➖ Simplified approximation | The stateless `/api/v1/payplan/*` endpoints. |
| **`weekly_repo.py`** | Production = services × prices | ✅ (pricing) | Weekly-data upsert + bulk import. |
| **`goal_service.py`** | Stores goal targets (PPH/hours/services) | ✅ (targets mirror the tier math) | Goal setting/review. |

> **Important:** the tiered `PayPlanEngine` is the accurate representation of the
> client's plan. The flat-commission functional helpers are a deliberately
> simpler approximation retained for the current stateless calculator endpoints
> (documented in `docs/pay-plan-logic.md`). Both are described below so nothing is
> hidden.

---

## 2. Constants (straight from the workbook)

Defined in `pay_engine.py`:

| Constant | Value | Excel cell | Meaning |
| --- | --- | --- | --- |
| `DEFAULT_NP_RATE` | `0.4` | `B6` | Net-production factor: **pay rate = 0.4 × PPH**. |
| `DEFAULT_HAIRCUT_PRICE` | `23.0` | `T6` | Production ($) per haircut. |
| `DEFAULT_COLOR_PRICE` | `85.0` | `AC6` | Production ($) per color service. |
| Guarantee rate | e.g. `12` / `13` | `E3` | Hourly pay floor (per stylist/salon). |
| NP% | `19.5%` | col `O` | `1 − 0.4 − (16%+5%+1.5%+18%)` overhead. |

`DEFAULT_PPH_TIERS` hardcodes the pay-rate → required-PPH table (rates $11–$29),
identical to columns B & C of both sheets.

---

## 3. PPH — the required production-per-hour for a pay rate

**Formula (Excel `C = ROUND(rate / 0.4, 0)`):**

```
PPH(rate) = round_half_up(rate / 0.4)
```

- Uses **half-up** rounding, so `13 / 0.4 = 32.5 → 33` (Python's banker's `round`
  would give `32` — a real bug avoided).
- `PayPlanEngine.pph_for_rate(rate)` returns the **exact table value** for on-tier
  rates, or `rate / np_rate` for off-tier rates.

Resulting table (verified against columns B/C on both sheets):

| Rate | PPH | Rate | PPH | Rate | PPH |
| --- | --- | --- | --- | --- | --- |
| 11 | 28 | 18 | 45 | 25 | 63 |
| 12 | 30 | 19 | 48 | 26 | 65 |
| 13 | 33 | 20 | 50 | 27 | 68 |
| 14 | 35 | 21 | 53 | 28 | 70 |
| 15 | 38 | 22 | 55 | 29 | 73 |
| 16 | 40 | 23 | 58 | | |
| 17 | 43 | 24 | 60 | | |

---

## 4. Required production (the "targets" a stylist must hit)

### 4.1 Weekly required production — column **K**

```
required_weekly(rate) = PPH(rate) × total_scheduled_hours
```

- Code: `PayPlanEngine.get_required_weekly_production(rate, scheduled_hours)`.
- Sheet gates rows **below the guarantee to 0** (`IF(rate < guarantee, 0, …)`).
  The engine returns the raw `PPH × hours`; the **guarantee gating is applied by
  the caller / presentation layer** (the Streamlit engine and frontend apply it).
- Verified: e.g. Rebeca rate 13 → `33 × 27.25 = 899.25`; rate 16 → `1090`.
  Steph rate 14 → `35 × 28 = 980`; rate 16 → `1120`.

### 4.2 Daily required production — columns **D–J**

```
daily_required(rate)[day] = PPH(rate) × daily_hours[day]     (0 if rate < guarantee)
```

- Code: `PayPlanEngine.get_daily_required_production(rate, daily_hours)` (returns a
  per-day dict plus a `"Week"` total).
- Verified per day, e.g. Steph rate 13 → `Mon 99 / Tue 165 / Wed 132 / Thu 132 /
  Fri 198 / Sat 198` (= 924).

### 4.3 Minimum expected production — cell **N3**

```
min_expected = round_half_up(guarantee / 0.4 × total_scheduled_hours)
```

- Code: `PayPlanEngine.min_expected_production(scheduled_hours)` returns the
  **exact** `guarantee / np_rate × hours` (e.g. `817.5`); the workbook's `N3`
  applies `ROUND` for display (`818`). The Streamlit engine rounds to match the
  cell exactly (`818`). Both are correct — one keeps precision, one matches the
  displayed cell.
- Verified: guarantee 12 → `817.5 (≈818)`; guarantee 13 → `910`.

> ⚠️ Subtlety (matches the sheet): `required_weekly` uses the **rounded tier PPH**,
> while `min_expected` uses the **exact** `guarantee / 0.4`. That's why, at the
> guarantee rate, `weekly_required` and `min_expected` can differ slightly (e.g.
> Steph rate 13: required `924` vs min-expected `910`).

---

## 5. Pay & increments

### 5.1 Weekly pay — column **M**

```
weekly_pay(rate) = total_scheduled_hours × rate     (0 if rate < guarantee)
```

- Code: `PayPlanEngine.calculate_projected_week_pay(rate, hours)`.
- Verified: Rebeca rate 12 → `327`, rate 13 → `354.25`, rate 16 → `436`.

### 5.2 Weekly pay increment (above guarantee) — column **N**

```
weekly_pay_incr(rate) = hours × rate − hours × guarantee = hours × (rate − guarantee)
                        (0 if rate ≤ guarantee)
```

- Code: `PayPlanEngine.weekly_pay_increment(rate, hours)`.
- Verified: Rebeca rate 13 → `27.25`, rate 16 → `109`; Steph rate 14 → `28`,
  rate 16 → `84`.

### 5.3 Weekly services increment — column **L**

```
weekly_svcs_incr(rate) = required_weekly(rate) − min_expected     (0 if rate ≤ guarantee)
```

- This uses the **rounded** `min_expected` (the `N3` value) — critical to match
  the sheet. It is implemented in the Streamlit engine (`weekly_svcs_incr`) and
  the frontend; the backend `PayPlanEngine` exposes the primitives to compute it
  (`required_weekly − min_expected`) but does not ship a dedicated method.
- Verified: Rebeca rate 13 → `899.25 − 818 = 81.25`; Steph rate 14 →
  `980 − 910 = 70`.

### 5.4 NP% — column **O**

```
NP% = 1 − 0.4 − (0.16 + 0.05 + 0.015 + 0.18) = 0.195   (active rows)
```

The 40.5% overhead (`16% + 5% + 1.5% + 18%`) plus the 40% net-production factor
leaves a **19.5%** net-profit share. Inactive rows (production ≈ 0) show the
negative base (`−0.4 − 0.405 = −0.805`), an artifact of the sheet's `IF`.

---

## 6. Effective (achieved) pay rate — turning real PPH into a rate

Given a stylist's **actual** production and hours:

```
achieved_PPH   = production / hours_worked
earned_rate    = highest tier whose required PPH ≤ achieved_PPH   (step function)
               = floored at the guarantee rate
week_pay       = earned_rate × hours_worked   (never below guarantee × hours)
```

- Code: `PayPlanEngine.get_effective_rate(achieved_pph, interpolate=False,
  apply_guarantee=True)`:
  - **Step (default):** you must *fully* reach a tier's PPH to earn its rate
    (PPH 32 → rate 12, because rate 13 needs PPH 33).
  - **Interpolate (opt-in):** linear between the two surrounding tiers, for a
    smooth "progress to next tier" read-out.
  - **Guarantee floor:** the result never drops below the guarantee.
- Verified: PPH 32 → 12, PPH 40 → 16; Steph's $1,086 over 28h → PPH ≈ 38.79 →
  **rate 15** (tier 15 needs PPH 38).

---

## 7. Revenue / production metrics (services → dollars)

### 7.1 Production from service counts

Production is the dollar value of services performed:

```
production = haircuts × haircut_price + colors × color_price + other_value
           = haircuts × 23 + colors × 85 (+ retail/add-ons)
```

- Code: `weekly_repo._derive_production(...)` (uses the **salon's** configurable
  `service_prices`, defaulting to `$23 / $85`).
- Used on every weekly-data upsert and bulk import so stored production always
  ties out to the service counts × prices — consistent whether Zenoti is up or the
  data was hand-entered.

### 7.2 Service mix from a production target (the reverse)

```
all_haircuts = ceil(target / 23)      # if you did only haircuts
all_colors   = ceil(target / 85)      # if you did only colors
blended      = ceil(share×target/23) haircuts + ceil((1−share)×target/85) colors
```

- Code: `PayPlanEngine.suggest_service_mix(required_production, config)`.
- Example: `$817.5` → 36 haircuts **or** 10 colors.

### 7.3 Over / short

```
over_short = actual_production − required_production      (≥ 0 = over/green, < 0 = short/red)
```

Used for daily and weekly progress; the frontend colors it green/red.

---

## 8. "What's still needed" — remaining-hours logic

To reach/sustain a target rate given work already banked:

```
required_total          = PPH(target) × scheduled_hours
remaining_production     = max(0, required_total − production_so_far)
required_pph_remaining   = remaining_production / hours_remaining
```

- Code: `PayPlanEngine.calculate_production_needed_to_sustain(desired_rate,
  scheduled_hours, production_so_far, hours_remaining)`.

---

## 9. The two backend calculator layers, precisely

### 9.1 Authoritative tiered engine — `PayPlanEngine`

Everything in §3–§8. **Verified against the spreadsheet (857/857).** This is the
correct representation of the client's plan and the reference for the frontend
tier math (`src/lib/tiers.ts`) and the Streamlit engine.

### 9.2 Stateless endpoint helpers — flat commission (approximation)

The current HTTP endpoints use simpler flat-commission helpers:

**`POST /api/v1/payplan/effective-rate`** → `effective_pay(...)`:
```
commission_pay = production × commission_rate        # default commission_rate = 0.42
guarantee_pay  = hours × guarantee_rate
pay            = max(commission_pay, guarantee_pay)
effective_rate = pay / hours
pph            = production / hours
on_guarantee   = guarantee_pay ≥ commission_pay
```
Example (from the API smoke test): production `1000`, hours `8`, commission `0.42`
→ commission `420`, guarantee `8 × …`, `pay = 420`, `on_guarantee = false`.

**`POST /api/v1/payplan/what-if`** → `plan_what_if(...)`:
```
plan_hours          = scheduled_hours + extra_hours
target_pay          = target_rate × plan_hours
required_production  = target_pay / commission_rate
remaining_production = max(0, required_production − production_to_date)
per_day_production    = remaining_production / remaining_days
avg_ticket           = mix×avg_ticket_haircut + (1−mix)×avg_ticket_color
projected_services    = remaining_production / avg_ticket   (split into haircuts/colors)
```

> These helpers are a **flat 42% commission** approximation (matching the older
> frontend `payEngine.ts`), **not** the tiered `0.4`-factor model. They're fine
> for a quick calculator but are not the client's exact tiered plan. Reconciling
> the endpoints to `PayPlanEngine` is a documented next step.

---

## 10. Verification methodology

The check (`/tmp/verify_pay.py` during review; reproducible) does the following for
**both** sheets:

1. Reads the guarantee (`E3`), the daily scheduled hours (`D7:J7`), the total
   (`K7`), and `N3` from the workbook with `data_only=True` (computed values).
2. For **every** pay-rate row (11–29) reads the expected `PPH (C)`, `K`, `L`, `M`,
   `N`, and each daily target `D–J`.
3. Recomputes each value with:
   - the **backend** `PayPlanEngine` (PPH, required weekly, weekly pay, pay
     increment, daily targets, min-expected — for active rows `rate ≥ guarantee`),
   - the **Streamlit** engine (full sheet semantics incl. guarantee gating and
     column L), and
4. Asserts equality within `$0.01`. It also checks the service prices, the NP
   factor, and the effective-rate tier lookup.

Result: **857 assertions, 0 failures.** Additionally, the committed suites
(`backend/tests/test_pay_engine.py`, `streamlit_app/tests/test_calculations.py`,
`scripts/test-team-calculations.mjs`) assert the same worked-example values on
every CI run.

---

## 11. Goal targets (how goals relate to the math)

Goals (`goal_service.py`, `Goal` model) store a stylist's **targets** for a pay
period: `target_pph`, `target_hours`, `target_haircuts`, `target_colors`. These
mirror the tier math:

```
target_pph ≈ round(target_rate / 0.4)          # a pay-rate target expressed as PPH
target production implied = target_pph × target_hours
```

Goal setting/override and manager review are business logic (one active goal per
`(stylist, week)`, `previous_goal_id` history, notifications) — they don't change
the pay math; they capture and track targets built from it. See `client_readme.md`
§7.2 and the `goal_service` docstrings.

---

## 12. Edge cases (all handled)

- **0 scheduled/worked hours** (full-week call-off): PPH, required production, and
  pay all resolve to `0` (no division by zero — guarded).
- **Rate below guarantee:** required production and pay are `0` on the sheet
  (gating); the guarantee floor still pays `guarantee × hours` on actuals.
- **Rounding:** PPH uses half-up (not banker's); `min_expected` is exact in the
  engine and rounded for the `N3` display; comparisons tie out to the cent.
- **Off-tier target rates:** `pph_for_rate` falls back to `rate / 0.4`.

---

## 13. Quick file map

| Figure | Function | File |
| --- | --- | --- |
| PPH for a rate | `pph_for_rate` | `backend/app/services/pay_engine.py` |
| Weekly required (K) | `get_required_weekly_production` | pay_engine.py |
| Daily required (D–J) | `get_daily_required_production` | pay_engine.py |
| Min expected (N3) | `min_expected_production` | pay_engine.py |
| Weekly pay (M) | `calculate_projected_week_pay` | pay_engine.py |
| Pay increment (N) | `weekly_pay_increment` | pay_engine.py |
| Effective/achieved rate | `get_effective_rate` | pay_engine.py |
| Service mix | `suggest_service_mix` | pay_engine.py |
| Remaining-to-sustain | `calculate_production_needed_to_sustain` | pay_engine.py |
| Production from services | `_derive_production` | `backend/app/services/weekly_repo.py` |
| Flat effective-rate endpoint | `effective_pay` | pay_engine.py (via `api/v1/payplan.py`) |
| Flat what-if endpoint | `plan_what_if` | pay_engine.py (via `api/v1/payplan.py`) |
| Goal targets | `set_goal` | `backend/app/services/goal_service.py` |

---

*Accuracy verified against `docs/spec/PPH Based Payplan.xlsx` on the fully-merged
`main`. Regenerate this check after any change to `pay_engine.py` or the tier
table, and keep `docs/pay-plan-logic.md`, `pay_engine.py`, `src/lib/tiers.ts`, and
`streamlit_app/calculations.py` in agreement.*

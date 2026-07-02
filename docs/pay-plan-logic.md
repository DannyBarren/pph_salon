# PPH Pay Plan — Calculation Logic

> **Canonical sources:** [`spec/PPH Stylist App.pdf`](./spec/) (requirements) and
> [`spec/PPH Based Payplan.xlsx`](./spec/) (formulas + examples, sheets **Sched
> View** and **Actual**).
>
> ⚠️ **Reconciliation note:** At the time of writing, the binary spec files had
> not been committed to the repo. The formulas below describe the model
> currently implemented in code (`backend/app/services/pay_engine.py` and
> `frontend/src/lib/payEngine.ts`). When the Excel is added under `docs/spec/`,
> **verify the exact tier bands, guarantee rate, and coefficients against it and
> update this document + both engines together.** The two engines must always
> agree.

## 1. Concepts & terminology

| Term | Meaning |
| --- | --- |
| **Production** | Dollar value of services a stylist performs (haircuts, colors, add-ons). |
| **PPH (Production Per Hour)** | `production / hours`. The core productivity metric the plan is named for. |
| **Scheduled hours** | Hours a stylist is rostered to work (the **Sched View** sheet). |
| **Actual hours** | Hours actually worked / production actually recorded (the **Actual** sheet). |
| **Guarantee rate** | Minimum hourly pay a stylist receives regardless of production (a floor). Can be set globally or per salon. |
| **Commission rate** | Fraction of production paid to the stylist (e.g. `0.42` = 42%). |
| **Effective rate** | The stylist's realized `$ / hour` after the plan is applied. |
| **Production to sustain** | The production required to *sustain* a given effective rate over a set of hours. |

## 2. Core formulas

For any block of hours + production:

```
commission_pay = production × commission_rate
guarantee_pay  = hours × guarantee_rate
pay            = max(commission_pay, guarantee_pay)     # guarantee is a floor
effective_rate = pay / hours
pph            = production / hours
on_guarantee   = guarantee_pay ≥ commission_pay
```

Inverting the effective rate to find the **production required / to sustain** a
target rate over a number of hours:

```
required_production = target_rate × hours ÷ commission_rate
```

Remaining production still needed within a pay period:

```
remaining_production = max(0, required_production − production_to_date)
per_day_production   = remaining_production ÷ remaining_working_days
```

Translating remaining production into a **service plan** (haircuts vs colors),
where `service_mix_haircut` is the fraction of services that are haircuts:

```
avg_ticket          = mix × avg_ticket_haircut + (1 − mix) × avg_ticket_color
projected_services  = remaining_production ÷ avg_ticket
projected_haircuts  = projected_services × mix
projected_colors    = projected_services × (1 − mix)
```

## 3. Configurable parameters (admin-controlled)

Nothing above is hard-coded — every coefficient is an admin/SDL setting so the
client can tune the plan without code changes:

| Parameter | Default | Notes |
| --- | --- | --- |
| `guarantee_rate` | `$16/hr` | Global floor. |
| `salon_guarantee[salon_id]` | per salon | Overrides the global floor. |
| `commission_rate` | `0.42` | Share of production paid out. |
| `avg_ticket_haircut` | `$48` | Used for projecting future services. |
| `avg_ticket_color` | `$135` | Used for projecting future services. |
| `service_mix_haircut` | `0.60` | Default haircut/color split for projections. |
| `min_services_per_day` | `6` | Feasibility check for planned targets. |

## 4. Tiered PPH mapping (to reconcile with the Excel)

Many PPH plans express pay as a **tier table** that maps a PPH band to a pay
rate, rather than a single flat commission. The engine supports this via
`tiered_rate(pph, tiers)`. Example table (illustrative — **replace with the
real bands from the Excel**):

| PPH band | Effective pay rate |
| --- | --- |
| `0 – 49` | guarantee (`$16/hr`) |
| `50 – 79` | `$22/hr` |
| `80 – 109` | `$30/hr` |
| `110+` | `$38/hr` |

The flat-commission model and the tier model are two representations of the
same idea; the flat `commission_rate` is the simplified form currently used by
the app. Once the spreadsheet tiers are confirmed, decide which representation
is authoritative (or keep both, with tiers driving the displayed rate and
commission driving the money).

## 5. Sched View vs. Actual

- **Sched View** — forward-looking. Uses *scheduled* hours to project what a
  stylist *should* produce to hit a rate. Drives the **What-If / Future Goals
  planner**.
- **Actual** — backward-looking. Uses *recorded* hours + production to compute
  the realized effective rate for completed days. Drives the dashboards.

In the app, a day contributes to **actuals** as soon as it has recorded
activity (worked hours or production); scheduled-but-empty days count as
**remaining** capacity for planning.

## 6. Worked examples

Assume `commission_rate = 0.42`, `guarantee_rate = $17` (salon override):

1. **High producer** — `$1,000` production over `8h`:
   `commission = 420`, `guarantee = 136` → **pay `$420`**, effective **`$52.50/hr`**, `on_guarantee = false`.
2. **Guarantee floor** — `$200` production over `8h`:
   `commission = 84`, `guarantee = 136` → **pay `$136`**, effective **`$17/hr`**, `on_guarantee = true`.
3. **Target planning** — sustain **`$30/hr`** over `40h`:
   `required_production = 30 × 40 ÷ 0.42 = $2,857`. If `$1,800` is banked, `remaining = $1,057`.

These examples are encoded as regression tests in
`backend/tests/test_pay_engine.py` — keep them in sync with the Excel examples.

# Spec source files

Drop the client's source-of-truth documents here so they are versioned with the
code and referenced by the docs and README:

| File | Purpose | Status |
| --- | --- | --- |
| `PPH Based Payplan.xlsx` | Pay formulas + worked examples. Sheets: **Sched View**, **Actual**, **Inputs**. | ✅ present |
| `PPH Stylist App.pdf` | Full product requirements & mockups. | ⬜ add when available |

The pay plan Excel has been extracted into the authoritative engine
(`backend/app/services/pay_engine.py` → `PayPlanEngine`) and documented in
[`../pay-plan-logic.md`](../pay-plan-logic.md), with exact-value regression
tests in `backend/tests/test_pay_engine.py`.

> **Still to reconcile:** the frontend planner (`src/lib/payEngine.ts`)
> and the module's older functional helpers use a simplified flat-commission
> approximation — align them with the tiered `PayPlanEngine` in a future PR.

To add the PDF:

```bash
git add "docs/spec/PPH Stylist App.pdf"
git commit -m "docs: add client requirements PDF"
```

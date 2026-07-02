# Spec source files

Drop the client's source-of-truth documents here so they are versioned with the
code and referenced by the docs and README:

| File | Purpose |
| --- | --- |
| `PPH Stylist App.pdf` | Full product requirements & mockups. |
| `PPH Based Payplan.xlsx` | Pay formulas + worked examples. Sheets: **Sched View**, **Actual**. |

> These binary files were **not available** when the repository was scaffolded.
> Once added, reconcile [`../pay-plan-logic.md`](../pay-plan-logic.md) and the
> two pay engines (`backend/app/services/pay_engine.py`,
> `frontend/src/lib/payEngine.ts`) against the exact tiers/coefficients in the
> Excel, and keep the regression tests in sync.

To add them:

```bash
# from the repo root, after copying the files in:
git add "docs/spec/PPH Stylist App.pdf" "docs/spec/PPH Based Payplan.xlsx"
git commit -m "docs: add client spec (PDF + pay plan Excel)"
```

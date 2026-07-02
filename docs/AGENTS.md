# AGENTS.md — Rules for Cursor Agents

This repository is designed for autonomous Cursor agents. Read this file before
making changes. Keep changes focused, tested, and consistent with the structure
below.

## 1. Repository map

```
pph_salon/
├── backend/        FastAPI + SQLAlchemy API (Python 3.12). Pay engine lives here.
├── frontend/       Next.js 16 (App Router) + TypeScript + Tailwind app.
├── docs/           Specs & living documentation (this folder).
│   ├── AGENTS.md            ← you are here
│   ├── pay-plan-logic.md    ← the authoritative pay math
│   └── spec/                ← the client PDF + Excel source files
├── scripts/        Dev/ops scripts (DB seeding, etc.).
├── .github/        CI workflows + PR template.
└── docker-compose.yml   Postgres + backend + frontend for local dev.
```

## 2. Golden rules

1. **The pay math has one source of truth per side:**
   `backend/app/services/pay_engine.py` and `frontend/src/lib/payEngine.ts`.
   They must stay in agreement, and both must match
   [`docs/pay-plan-logic.md`](./pay-plan-logic.md). If you change a formula,
   change all three in the same PR and update the tests.
2. **Never hard-code pay coefficients** in UI or endpoints. They come from the
   admin/SDL configuration object. Add new coefficients to the config, not to
   call sites.
3. **Respect role-based access.** Stylist → own data only; Salon Manager →
   direct reports; SDL/Owner → everything + admin. Enforce on both frontend and
   backend.
4. **Don't break the demo.** The frontend ships with mock data + a no-login demo
   account switcher. Keep it working even as real APIs are added (feature-flag
   or fall back to mock data).

## 3. Coding standards

### Backend (Python)

- Python **3.11+**, type hints everywhere, `from __future__ import annotations`.
- Format/lint with **ruff** (`ruff check . && ruff format .`). Config in
  `backend/pyproject.toml`.
- Pydantic v2 for all request/response schemas. Business logic goes in
  `app/services/`, HTTP concerns in `app/api/`.
- Keep endpoints thin; keep the pay engine pure and side-effect free.

### Frontend (TypeScript)

- **TypeScript strict**, Next.js **App Router**, functional components.
- Styling with **Tailwind**; reuse primitives in `src/components/ui/`.
- No new heavyweight dependencies without justification.
- Lint with `npm run lint` and ensure `npm run build` passes.
- Money/number formatting via the helpers in `src/lib/format.ts`.

## 4. Testing requirements

- **Backend:** every change to `pay_engine.py` needs/updates unit tests in
  `backend/tests/`. Run `pytest` before committing. API changes get a smoke
  test in `tests/test_api.py`.
- **Frontend:** `npm run build` and `npm run lint` must pass. Add component
  tests where a testing setup exists.
- CI (`.github/workflows/ci.yml`) runs backend lint+tests and frontend
  lint+build on every PR. **Do not merge red CI.**

## 5. UI fidelity

- Match the mockups / spec in `docs/spec/`. The UI should be clean, modern,
  motivational, mobile-first, and **not** replicate dense spreadsheet tables —
  translate logic into glanceable visual components.
- Preserve the existing information architecture: Dashboard, Planner, Team,
  Admin. Keep the demo account switcher prominent and instant.

## 6. Git & workflow

- Branch names: `cursor/<descriptive-name>`. One logical change per commit with
  clear messages. Do not force-push or amend shared history.
- Never commit secrets. Use `.env` (git-ignored); document new vars in the
  relevant `.env.example`.
- Open a PR using the template in `.github/`; describe what changed and how you
  verified it. Do not merge without green CI.

## 7. Definition of done

- [ ] Code matches the standards above and existing patterns.
- [ ] `pay-plan-logic.md` + both engines agree (if pay logic touched).
- [ ] Tests added/updated and passing locally.
- [ ] `ruff` / `npm run lint` clean; backend `pytest` and frontend `build` pass.
- [ ] Role-based access respected; demo still works.
- [ ] PR description explains the change and verification steps.

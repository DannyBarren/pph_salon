# PPH Stylist App

A full-stack app that helps hair stylists understand how their **scheduled hours
and production** translate into earnings under a **PPH (Production Per Hour) pay
plan**, and plan what they still need to do to hit a target rate.

- **Stylists** get a mobile-first view of their effective pay rate, production,
  a **Week Summary**, a **Week-by-Day** breakdown, and an interactive
  **What-If / Future Goals** planner.
- **Salon Managers** see their direct reports; **SDL / Owner** sees everyone and
  controls the pay-plan configuration (Admin).

The **Next.js web app lives at the repository root**, so Vercel deploys it with
**Root Directory = repo root** (no monorepo configuration needed). The optional
**FastAPI backend** (pay-plan API + the Excel-accurate engine) lives in
[`backend/`](./backend) and is ignored by the Vercel build.

## Deploying to Vercel

1. **Production Branch:** the branch that contains this root-level app
   (e.g. `main`).
2. **Root Directory:** leave **blank / repo root** (do *not* set `frontend`).
3. **Framework Preset:** Next.js.
4. `next build` runs at the root and deploys. That's it.

> **Two modes, one codebase.** By default the app runs in **demo mode**
> (`NEXT_PUBLIC_DEMO_MODE` unset/true): all data is mocked in-memory + persisted
> to `localStorage`, so the demo works with **no backend and no login** — the
> account switcher is instant. Set `NEXT_PUBLIC_DEMO_MODE=false` (and point
> `NEXT_PUBLIC_API_BASE_URL` at the backend) for **production**: real JWT login,
> the demo switcher hidden, all mocks/localStorage disabled, and every entity
> served from PostgreSQL via the FastAPI API.
>
> **Deploying for real?** Follow [`PRODUCTION_INSTRUCTIONS.md`](./PRODUCTION_INSTRUCTIONS.md)
> — a complete step-by-step deploy + first-run guide (admin bootstrap, Vercel +
> Railway/Render, env vars, seeding, data import, security checklist, scaling).

## Quick start (frontend)

```bash
npm install
npm run dev        # http://localhost:3000
# or
npm run build && npm run start
```

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| **Frontend** | Next.js 16 (App Router) + TypeScript + Tailwind v4 | Modern DX; zero-config Vercel deploys. |
| **Backend** | FastAPI (Python 3.12) + Pydantic v2 | Typed, auto OpenAPI docs; pure, testable pay engine. |
| **Database** | PostgreSQL (SQLAlchemy + Alembic) | Relational store for salons/users/production; migrations. |
| **Local dev** | Docker Compose | Postgres + API in one command. |

## Features

- **Demo account switcher** — instant, no-login role switching (3 stylists,
  1 salon manager, 1 SDL/owner) that re-scopes the whole app.
- **Strict role hierarchy** — Stylist → self, Manager → direct reports, SDL → all.
- **Time navigation** — Current + Prior (biweekly), Pay Period, Single Week, planner.
- **Week Summary** + **Week-by-Day** breakdown per stylist.
- **What-If planner** — target effective-rate / extra-hours / service-focus
  sliders with live required production, daily targets, and projected services.
- **Admin configuration** of the pay engine + CSV/manual data import.
- Light gamification (streaks, goals, flash goals).

## Team Dashboard (managers / SDL)

Managers, SDLs, and owners land on a **Team Dashboard** (`/team`) by default —
a production-grade view of their whole team for the current week (`6/29 – 7/5`).
Stylists are unaffected and keep their personal Week Summary / Planner.

- **Real data:** Rebeca (18939) and Steph (11027) are pulled verbatim from
  `docs/spec/PPH Based Payplan.xlsx` (sheets *Sched View* and *Actual*); six more
  stylists are modelled with the same $23 haircut / $85 color economics.
- **At a glance:** 6 KPI cards, effective-rate distribution, a "needs attention"
  callout, and per-stylist cards/table showing effective pay rate, progress to
  the next PayRt tier, utilization, over/short, and the **exact production +
  services still needed** to hit the salon target (adjustable in-header).
- **Views:** Cards ↔ Table, Actual ↔ Scheduled, status chips, search, sort,
  CSV export, manual + 5-min auto refresh.
- **Detail modal:** Week Summary, Week-by-Day, and a pre-filled What-If per
  stylist, plus manager-only extras (vs-team-average, coaching note).
- **Robustness:** custom React-Query-style caching (`staleTime`/`gcTime`/retry/
  refetch-on-focus), retry-with-backoff service layer, Zod-lite validation,
  section error boundaries, skeleton/empty/error states, a11y (focus trap,
  ARIA, color+icon+text), and `content-visibility` windowing past 25 rows.

The math lives in `src/lib/tiers.ts` (a faithful port of the backend
`PayPlanEngine`); regression tests that assert exact workbook values run with
`npm run test:calc`. Toggle the feature with
`NEXT_PUBLIC_FEATURE_TEAM_DASHBOARD=false`.

## How the pay plan works (brief)

```
pay            = max(production × commission_rate, hours × guarantee_rate)
effective_rate = pay / hours          # headline $/hr
pph            = production / hours    # production per hour
required_production = target_rate × hours ÷ commission_rate
```

The backend `PayPlanEngine` reproduces `docs/spec/PPH Based Payplan.xlsx`
exactly (tier table, per-salon guarantees, min-expected, service mix). Full
details + worked examples: [`docs/pay-plan-logic.md`](./docs/pay-plan-logic.md).

## Repository structure

```
pph_salon/
├── src/                Next.js app (App Router) — AT THE REPO ROOT
│   ├── app/            routes: / (dashboard), /planner, /team, /admin
│   ├── components/     UI + feature components
│   └── lib/            payEngine.ts, mockData.ts, time.ts, selection.ts, …
├── public/             static assets
├── package.json, next.config.mjs, tsconfig.json, vercel.json   (root)
├── backend/            FastAPI API + Excel-accurate pay engine + tests
├── docs/               AGENTS.md, pay-plan-logic.md, spec/ (source Excel)
├── scripts/            dev/ops scripts (DB seeding, …)
├── .github/            CI (frontend build/lint + backend tests) + PR template
└── docker-compose.yml  Postgres + backend for local dev
```

## Backend & tests

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # needs python3-venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000           # docs at /docs
ruff check . && pytest                              # lint + tests
```

## For future agents

Read [`docs/AGENTS.md`](./docs/AGENTS.md) first — repo map, coding standards,
testing requirements, and the rule that the pay math stays in sync across
`docs/pay-plan-logic.md`, `backend/app/services/pay_engine.py`, and
`src/lib/payEngine.ts`.

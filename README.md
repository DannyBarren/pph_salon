# PPH Stylist App

A full-stack app that helps hair stylists understand how their **scheduled
hours and production** translate into earnings under a **PPH (Production Per
Hour) pay plan** — and plan what they still need to do to hit a target rate.

- **Stylists** get a clean, mobile-first view of their effective pay rate,
  production, and an interactive *What-If / Future Goals* planner.
- **Salon Managers** see their direct reports; **SDL / Owner** sees everything
  and controls the pay-plan configuration.

> The interactive prototype (with a no-login demo account switcher and rich mock
> data) lives in [`frontend/`](./frontend) and is deployable to Vercel today.
> The [`backend/`](./backend) provides the FastAPI pay-calculation API and the
> foundation for persistence.

## Tech stack & rationale

| Layer | Choice | Why |
| --- | --- | --- |
| **Frontend** | Next.js 16 (App Router) + TypeScript + Tailwind | Fast, modern, great DX; deploys effortlessly to Vercel; SSR-ready. |
| **Backend** | FastAPI (Python 3.12) + Pydantic v2 | Concise, typed, auto-generated OpenAPI docs; the pay engine is pure Python and easily testable. |
| **Database** | PostgreSQL (SQLAlchemy + Alembic) | Reliable relational store for salons, users, schedules, and production; migrations via Alembic. |
| **Local dev** | Docker Compose | One command brings up Postgres + API + web. |

## Spec & source of truth

- 📄 Requirements & mockups: [`docs/spec/PPH Stylist App.pdf`](./docs/spec/)
- 📊 Pay formulas & examples: [`docs/spec/PPH Based Payplan.xlsx`](./docs/spec/)
  (sheets **Sched View** and **Actual**)
- 🧮 Documented pay logic: [`docs/pay-plan-logic.md`](./docs/pay-plan-logic.md)

> ⚠️ The binary spec files are expected under `docs/spec/`. If they aren't there
> yet, add them (see [`docs/spec/README.md`](./docs/spec/README.md)) and
> reconcile the pay logic doc + engines against them.

## How the pay plan works (brief)

Every stylist earns the **greater of** a commission on production or an hourly
**guarantee** (a floor):

```
pay            = max(production × commission_rate, hours × guarantee_rate)
effective_rate = pay / hours          # the headline $/hr
pph            = production / hours    # production per hour
```

To hit a target effective rate over a set of scheduled hours:

```
required_production = target_rate × hours ÷ commission_rate
```

All coefficients (guarantee rate, commission rate, average tickets, service
mix) are **admin-configurable** — nothing is hard-coded. Full details, tiers,
and worked examples: [`docs/pay-plan-logic.md`](./docs/pay-plan-logic.md).

## Repository structure

```
pph_salon/
├── backend/            FastAPI API + pay engine + tests   → see backend/README.md
├── frontend/           Next.js app (prototype + UI)       → see frontend/README.md
├── docs/
│   ├── AGENTS.md            Rules for Cursor agents
│   ├── pay-plan-logic.md    Authoritative pay math
│   └── spec/                Client PDF + Excel
├── scripts/            Dev/ops scripts (DB seeding, …)
├── .github/            CI workflow + PR template
└── docker-compose.yml  Postgres + backend + frontend
```

## Quick start

### Option A — Docker (full stack)

```bash
docker compose up --build
# frontend → http://localhost:3000
# backend  → http://localhost:8000  (docs at /docs)
# postgres → localhost:5432 (pph/pph)
```

### Option B — run each app directly

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # needs python3-venv
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

## Testing & CI

```bash
cd backend  && ruff check . && pytest        # backend lint + tests
cd frontend && npm run lint && npm run build # frontend lint + build
```

CI runs both on every PR — see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Deployment

- **Frontend → Vercel.** Set the Vercel project **Root Directory** to
  `frontend` (the app moved out of the repo root into `frontend/`). Framework
  preset: **Next.js**. See [`frontend/vercel.json`](./frontend/vercel.json).
- **Backend → any container host** using [`backend/Dockerfile`](./backend/Dockerfile),
  with `DATABASE_URL` pointed at a managed Postgres.

## For future Cursor agents

**Read [`docs/AGENTS.md`](./docs/AGENTS.md) first.** It covers the repo map,
coding standards, testing requirements, UI fidelity expectations, and the
golden rule that the pay math must stay in sync across
`docs/pay-plan-logic.md` and both pay engines.

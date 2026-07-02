# PPH Stylist App — Backend (FastAPI)

Stateless pay-plan calculation API plus the foundation for persistence
(PostgreSQL via SQLAlchemy/Alembic). The pay math lives in
[`app/services/pay_engine.py`](app/services/pay_engine.py) and is documented in
[`../docs/pay-plan-logic.md`](../docs/pay-plan-logic.md).

## Layout

```
backend/
  app/
    main.py            # FastAPI app + CORS + router wiring
    core/config.py     # env-driven settings (pydantic-settings)
    api/v1/            # versioned routers: health, payplan
    models/            # SQLModel ORM models (Salon, User, PayTier, Week, DailyPerformance)
    schemas/           # pydantic request/response models
    services/          # pay_engine.py — source of truth for pay math
    db/session.py      # engine + get_session dependency
  alembic/             # migration env + versions/
  alembic.ini
  tests/               # pytest unit + API + model tests
  requirements.txt
  pyproject.toml       # ruff + pytest config
  Dockerfile
```

## Database & migrations (SQLModel + Alembic)

Models live in `app/models/` and register on `SQLModel.metadata`, which Alembic
targets. The DB URL comes from `DATABASE_URL` (see `.env.example`); Postgres in
production, and any SQLAlchemy URL works locally.

```bash
# Postgres (via docker compose from the repo root):
docker compose up -d db
export DATABASE_URL="postgresql+psycopg2://pph:pph@localhost:5432/pph"

# …or a zero-dependency local SQLite DB:
export DATABASE_URL="sqlite:///./dev.db"

alembic upgrade head                                  # apply migrations
alembic revision --autogenerate -m "describe change"  # after editing models
alembic check                                         # fail if models drift from migrations
alembic downgrade -1                                  # roll back one revision
```

The initial migration (`alembic/versions/*_initial_models.py`) creates all five
tables with their indexes, unique constraints, and foreign keys.

## Local development

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # requires python3-venv
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Then open http://localhost:8000/docs for interactive Swagger docs.

> Prefer Docker? `docker compose up` from the repo root starts Postgres + this
> API together.

## Testing & linting

```bash
pytest          # unit + API tests
ruff check .    # lint
```

## Authentication & Demo Mode

JWT auth with role-based access control (`stylist` / `manager` / `admin`), plus
a **Demo Mode** so the whole app is usable with **no credentials**.

- **Demo Mode (default ON):** every protected route works with no login —
  `get_current_user` injects an admin-level user. Optionally send
  `X-Demo-User-Id: <id>` to *act as* a real user (e.g. a manager) and exercise
  role-scoped behavior without logging in.
- **Real mode:** enforces Bearer access tokens + role checks. Admins have full
  access; managers are scoped to their direct reports; stylists to themselves.

### Toggle Demo Mode (one setting)

```bash
# .env (or environment variable)
DEMO_MODE=true    # bypass all auth  (default)
DEMO_MODE=false   # enforce real JWT + roles
```
(Backed by `settings.demo_mode` in `app/core/config.py`.) Flipping to `false` is
the only change needed to lock the app down. Set a real `SECRET_KEY` too.

### Auth endpoints

| Method | Path                       | Notes                                   |
| ------ | -------------------------- | --------------------------------------- |
| POST   | `/api/v1/auth/register`    | Invite-only — **admin** creates a user  |
| POST   | `/api/v1/auth/login`       | email + password → access/refresh JWTs  |
| POST   | `/api/v1/auth/refresh`     | refresh token → new access token        |
| GET    | `/api/v1/auth/me`          | current principal (demo admin in demo)  |
| GET    | `/api/v1/users/visible-stylists` | role-scoped stylist list          |

### Curl — works in Demo Mode with NO token

```bash
BASE=http://localhost:8000/api/v1
curl $BASE/auth/me                                    # -> injected demo admin
curl -X POST $BASE/payplan/effective-rate \
  -H 'content-type: application/json' \
  -d '{"production":1000,"hours":8,"salon_id":"s1"}'  # -> 200, no auth needed

# Act as a specific user (e.g. manager id 3) without logging in:
curl $BASE/users/visible-stylists -H 'X-Demo-User-Id: 3'
```

### Curl — real mode (`DEMO_MODE=false`)

```bash
# 1) log in (an admin must already exist / be seeded)
curl -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@pph.com","password":"secret"}'
# -> {"access_token":"...","refresh_token":"...","token_type":"bearer"}

# 2) call protected routes with the token
TOKEN=... ; curl $BASE/auth/me -H "Authorization: Bearer $TOKEN"

# 3) admin invites a stylist
curl -X POST $BASE/auth/register -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"email":"maya@pph.com","password":"pw","name":"Maya","role":"stylist","salon_id":1}'
```

## Key endpoints

| Method | Path                          | Purpose                                        |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/v1/health`              | Liveness / version (public)                    |
| POST   | `/api/v1/payplan/effective-rate` | Pay + effective $/hr (protected)            |
| POST   | `/api/v1/payplan/what-if`     | Production/services required (protected)       |

All pay parameters (guarantee rate, commission rate, tickets, service mix) are
passed in the request `config` object so the engine stays admin-configurable —
exactly like the frontend planner.

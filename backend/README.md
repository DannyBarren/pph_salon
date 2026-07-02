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

## Key endpoints

| Method | Path                          | Purpose                                        |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/v1/health`              | Liveness / version                             |
| POST   | `/api/v1/payplan/effective-rate` | Pay + effective $/hr for production & hours |
| POST   | `/api/v1/payplan/what-if`     | Production/services required to hit a target   |

All pay parameters (guarantee rate, commission rate, tickets, service mix) are
passed in the request `config` object so the engine stays admin-configurable —
exactly like the frontend planner.

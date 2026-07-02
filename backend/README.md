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
    schemas/           # pydantic request/response models
    services/          # pay_engine.py — source of truth for pay math
  tests/               # pytest unit + API tests
  requirements.txt
  pyproject.toml       # ruff + pytest config
  Dockerfile
```

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

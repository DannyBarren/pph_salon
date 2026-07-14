#!/usr/bin/env sh
# Production entrypoint: apply DB migrations, then start the ASGI server.
set -e

echo "[entrypoint] Running database migrations (alembic upgrade head)…"
alembic upgrade head || echo "[entrypoint] WARNING: migrations failed or already applied"

WORKERS="${WEB_CONCURRENCY:-4}"
PORT="${PORT:-8000}"

echo "[entrypoint] Starting gunicorn with ${WORKERS} uvicorn workers on :${PORT}"
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w "${WORKERS}" \
  -b "0.0.0.0:${PORT}" \
  --timeout 60 \
  --access-logfile - \
  --error-logfile -

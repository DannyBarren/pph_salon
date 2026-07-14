"""Health / readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from app import __version__
from app.core.config import get_settings
from app.db.session import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — process is up (no dependencies checked)."""
    return {"status": "ok", "version": __version__}


@router.get("/health/ready")
def readiness(session: Session = Depends(get_session)) -> dict[str, object]:
    """Readiness probe — verifies database connectivity for load balancers."""
    settings = get_settings()
    db_ok = True
    detail = "connected"
    try:
        session.exec(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        db_ok = False
        detail = str(exc)
    return {
        "status": "ok" if db_ok else "degraded",
        "version": __version__,
        "environment": settings.environment,
        "database": {"ok": db_ok, "detail": detail},
    }

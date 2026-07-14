"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload --port 8000

Production (see Dockerfile):
    gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000

Interactive docs at http://localhost:8000/docs (disabled in production unless
``ENABLE_DOCS=true``).
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.logging import configure_logging, request_id_ctx

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger("app")

# ── Optional Sentry ─────────────────────────────────────────────────────────
if settings.sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
        logger.info("Sentry initialised for environment=%s", settings.environment)
    except Exception as exc:  # noqa: BLE001 - never let telemetry break boot
        logger.warning("Sentry init failed: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        "Starting %s v%s (env=%s, demo_mode=%s)",
        settings.app_name,
        __version__,
        settings.environment,
        settings.demo_mode,
    )
    if settings.is_production and settings.demo_mode:  # defensive: should be impossible
        raise RuntimeError("DEMO_MODE must be disabled in production")
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="Backend API for the PPH Stylist App — pay-plan calculations and data.",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    lifespan=lifespan,
)

# ── Rate limiting (slowapi) ─────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
if settings.rate_limit_enabled:
    app.add_middleware(SlowAPIMiddleware)

# ── Transport / host protections ────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1024)
if settings.allowed_hosts and "*" not in settings.allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Attach a request id, add security headers, and log timing."""
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    token = request_id_ctx.set(rid)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001 - convert to a clean 500 + log
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse(
            status_code=500, content={"detail": "Internal server error"}
        )
    finally:
        request_id_ctx.reset(token)

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
    response.headers["X-Response-Time-ms"] = f"{duration_ms:.1f}"
    # Security headers (helmet-equivalent).
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = settings.content_security_policy
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": __version__,
        "docs": "/docs" if settings.enable_docs else "disabled",
        "health": f"{settings.api_v1_prefix}/health",
    }

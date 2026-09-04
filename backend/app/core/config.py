"""Application configuration loaded from environment variables.

Uses pydantic-settings so values can come from a local ``.env`` file (see
``.env.example`` / ``.env.production.example``) or real environment variables in
Docker / production.

Security posture: ``DEMO_MODE`` defaults to ``True`` for a friction-free local
demo and the test-suite, but is **force-disabled** whenever ``ENVIRONMENT`` is
``production`` (see :meth:`Settings.enforce_production_safety`). A production boot
with the insecure default ``SECRET_KEY`` raises at import time so the app can
never ship with a known signing key.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

INSECURE_SECRET = "dev-insecure-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "PPH Stylist App API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"

    # Database (async or sync SQLAlchemy URL). Wired for future persistence.
    database_url: str = "postgresql+psycopg2://pph:pph@localhost:5432/pph"

    # CORS — the Next.js frontend origin(s). Accepts a JSON list or a
    # comma-separated string (``https://a.com,https://b.com``). ``NoDecode``
    # stops pydantic-settings from json.loads()ing the raw env value before
    # validation (which crashes on plain origin strings); ``_split_csv``
    # below handles both forms.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # Trusted Host header allow-list. ``*`` disables the check (dev default).
    allowed_hosts: Annotated[list[str], NoDecode] = ["*"]

    # ── Auth / JWT ──────────────────────────────────────────────────────
    # Change SECRET_KEY in any real environment (env var / secret manager).
    secret_key: str = INSECURE_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    # Minimum password length enforced on user creation / registration.
    min_password_length: int = 8

    # ── Account setup / invite links ────────────────────────────────────
    # Public base URL of the Next.js frontend, used to build the "set your
    # password" links emailed when an admin/manager unlocks (invites) an account.
    app_base_url: str = "http://localhost:3000"
    # How long a setup / invite link stays valid before it must be re-sent.
    invite_token_expire_hours: int = 72

    # ── Rate limiting ───────────────────────────────────────────────────
    rate_limit_enabled: bool = True
    # Default per-client limit for general endpoints (slowapi syntax).
    rate_limit_default: str = "200/minute"
    # Tighter limit for the login endpoint to blunt credential stuffing.
    rate_limit_login: str = "10/minute"
    # Limit for heavy admin import endpoints.
    rate_limit_import: str = "20/minute"

    # ── Security headers ────────────────────────────────────────────────
    # Content-Security-Policy applied to API responses (mostly relevant for
    # the Swagger/ReDoc pages the API itself serves).
    content_security_policy: str = (
        "default-src 'self'; img-src 'self' data: https:; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "connect-src 'self'; frame-ancestors 'none'"
    )
    # Gate the interactive docs (/docs, /redoc, /openapi.json) off in prod.
    enable_docs: bool = True

    # ── Email / SMS notification stubs ──────────────────────────────────
    # When keys are unset the providers no-op and just log (safe for staging).
    sendgrid_api_key: str | None = None
    email_from: str = "no-reply@pph.local"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None
    # Require users to verify their email before login (stub flow).
    require_email_verification: bool = False

    # ── Observability ───────────────────────────────────────────────────
    sentry_dsn: str | None = None

    # ── First-run bootstrap ─────────────────────────────────────────────
    # A one-time secret that authorises creating the FIRST owner account via
    # ``POST /auth/bootstrap`` — and only while the users table is empty. Unset
    # (None) disables the endpoint entirely. Set it for the initial deploy, then
    # rotate/unset it once the owner exists. This gives a secure, console-free way
    # to establish the top of the hierarchy without leaving open registration.
    bootstrap_token: str | None = None

    # ── Demo mode ───────────────────────────────────────────────────────
    # When True, ALL auth is bypassed: get_current_user injects an admin-level
    # user so every protected endpoint works with NO login. Flip to False (env
    # DEMO_MODE=false) to enforce real JWT + role checks. Forced OFF in prod.
    demo_mode: bool = True
    demo_user_name: str = "Demo Admin"
    demo_user_email: str = "demo@pph.local"

    @field_validator("cors_origins", "allowed_hosts", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Allow comma-separated strings or JSON lists for list-typed settings."""
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                try:
                    return json.loads(stripped)
                except json.JSONDecodeError:
                    return [stripped]
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @model_validator(mode="after")
    def enforce_production_safety(self) -> Settings:
        """Fail fast on insecure production configuration."""
        if self.is_production:
            # In production demo mode must never be on.
            object.__setattr__(self, "demo_mode", False)
            if self.secret_key == INSECURE_SECRET or len(self.secret_key) < 32:
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value (>=32 chars) "
                    "in production. Generate one with: python -c "
                    '"import secrets; print(secrets.token_urlsafe(48))"'
                )
            # Docs are opt-in in production.
            if "*" in self.allowed_hosts:
                # A wildcard host in prod defeats the TrustedHost protection.
                object.__setattr__(self, "allowed_hosts", self.allowed_hosts)
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()

"""Application configuration loaded from environment variables.

Uses pydantic-settings so values can come from a local ``.env`` file (see
``.env.example``) or real environment variables in Docker / production.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "PPH Stylist App API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    # Database (async or sync SQLAlchemy URL). Wired for future persistence.
    database_url: str = "postgresql+psycopg2://pph:pph@localhost:5432/pph"

    # CORS — the Next.js frontend origin(s).
    cors_origins: list[str] = ["http://localhost:3000"]

    # ── Auth / JWT ──────────────────────────────────────────────────────
    # Change SECRET_KEY in any real environment (env var / secret manager).
    secret_key: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # ── Demo mode ───────────────────────────────────────────────────────
    # When True, ALL auth is bypassed: get_current_user injects an admin-level
    # user so every protected endpoint works with NO login. Flip to False (env
    # DEMO_MODE=false) to enforce real JWT + role checks. That is the only
    # switch needed to lock the app down.
    demo_mode: bool = True
    demo_user_name: str = "Demo Admin"
    demo_user_email: str = "demo@pph.local"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()

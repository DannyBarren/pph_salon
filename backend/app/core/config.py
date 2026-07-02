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


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()

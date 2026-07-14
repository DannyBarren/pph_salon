"""Shared slowapi rate limiter.

Kept in its own module so routers can import the ``limiter`` instance for
per-route decorators (e.g. a tighter limit on ``/auth/login``) without creating
an import cycle with ``app.main``.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[_settings.rate_limit_default] if _settings.rate_limit_enabled else [],
    enabled=_settings.rate_limit_enabled,
    # Header injection requires a Response param on every decorated endpoint;
    # we skip it and let SlowAPIMiddleware enforce/limit transparently instead.
    headers_enabled=False,
)

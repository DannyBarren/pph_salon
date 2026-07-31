"""Shared pytest fixtures.

The slowapi rate limiter uses process-global in-memory storage keyed by client
address. Because the whole suite runs as one client ("testclient") within a
single minute, per-endpoint login/verify limits would otherwise leak across
tests and cause spurious 429s. Reset the limiter before every test so each test
starts with a clean allowance.
"""

from __future__ import annotations

import pytest
from app.core.limiter import limiter


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    try:
        limiter.reset()
    except Exception:  # noqa: BLE001 - never let limiter reset break a test
        pass
    yield

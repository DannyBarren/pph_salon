"""Structured-ish logging setup and a request-ID context.

Deliberately dependency-free (stdlib ``logging``) so it works everywhere. In a
larger deployment swap the formatter for JSON (structlog / python-json-logger).
"""

from __future__ import annotations

import logging
from contextvars import ContextVar

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        record.request_id = request_id_ctx.get()
        return True


def configure_logging(level: str = "INFO") -> None:
    """Idempotently configure root logging with a request-id aware format."""
    root = logging.getLogger()
    root.setLevel(level.upper())
    if any(isinstance(f, _RequestIdFilter) for h in root.handlers for f in h.filters):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"
        )
    )
    handler.addFilter(_RequestIdFilter())
    root.handlers = [handler]

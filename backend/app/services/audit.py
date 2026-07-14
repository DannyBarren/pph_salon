"""Audit-logging helper.

``record_audit`` writes an :class:`~app.models.audit_log.AuditLog` row for a
privileged action. It never raises into the caller's request path — auditing must
not be able to break a legitimate admin operation — but it does log failures.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlmodel import Session, select

from app.core.logging import request_id_ctx
from app.models import AuditLog, User

logger = logging.getLogger("app.audit")


def record_audit(
    session: Session,
    *,
    actor: Optional[User],
    action: str,
    target_type: str | None = None,
    target_id: str | int | None = None,
    salon_id: int | None = None,
    detail: dict[str, Any] | None = None,
    commit: bool = True,
) -> AuditLog | None:
    """Append an audit row. Returns the row (or ``None`` on failure)."""
    try:
        entry = AuditLog(
            actor_id=(actor.id if actor and actor.id else None),
            actor_email=(actor.email if actor else None),
            actor_role=(str(actor.role) if actor else None),
            action=action,
            target_type=target_type,
            target_id=(str(target_id) if target_id is not None else None),
            salon_id=salon_id,
            detail={"request_id": request_id_ctx.get(), **(detail or {})},
        )
        session.add(entry)
        if commit:
            session.commit()
            session.refresh(entry)
        logger.info("audit action=%s target=%s:%s actor=%s", action, target_type, target_id,
                    entry.actor_email)
        return entry
    except Exception as exc:  # noqa: BLE001 - auditing must not break the action
        logger.warning("Failed to write audit log for action=%s: %s", action, exc)
        return None


def list_audit(session: Session, *, limit: int = 200, salon_id: int | None = None) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if salon_id is not None:
        stmt = stmt.where(AuditLog.salon_id == salon_id)
    return list(session.exec(stmt).all())

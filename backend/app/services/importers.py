"""Data-import pipeline: source adapters + bulk user provisioning.

Two responsibilities:

1. **Column normalisation** — map heterogeneous vendor exports (Zenoti employee
   performance, PayCor hours) onto our canonical weekly-import columns. Native
   files (matching our own template) pass through unchanged. This is the seam for
   future live API hooks (`fetch_zenoti_week`, `fetch_paycor_week`).
2. **Bulk user creation** — turn parsed CSV rows into ``User`` records, resolving
   salons/managers by id *or* name, generating temp passwords, and reporting a
   per-row result so one bad row never fails the batch.
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.core import security
from app.models import Salon, User, UserRole
from app.schemas.user import BulkUserResult

# ── Vendor column mappings → our canonical import columns ────────────────────
# Keys are canonical column names; values are candidate source headers (lowercased).
_ZENOTI_MAP = {
    "user_id": ["employee id", "employee_id", "provider id", "emp id"],
    "salon_name": ["center name", "center", "location", "salon"],
    "week_start": ["week start", "start date", "period start", "date"],
    "scheduled_hrs": ["scheduled hours", "scheduled hrs", "sched hours"],
    "actual_hrs": ["worked hours", "actual hours", "hours worked"],
    "actual_haircuts": ["haircuts", "hair cut count", "cuts"],
    "actual_colors": ["colors", "color count", "colour"],
    "actual_other_value": ["retail", "other revenue", "addon revenue"],
    "notes": ["notes", "comment"],
}

_PAYCOR_MAP = {
    "user_id": ["employee number", "employee id", "emp number", "associate id"],
    "salon_name": ["location", "department", "cost center"],
    "week_start": ["pay period start", "week beginning", "period start"],
    "scheduled_hrs": ["scheduled hours", "sched hrs"],
    "actual_hrs": ["regular hours", "total hours", "hours"],
    "guarantee_rate": ["base rate", "hourly rate", "rate"],
    "notes": ["notes"],
}

SOURCE_MAPS: dict[str, dict[str, list[str]]] = {
    "zenoti": _ZENOTI_MAP,
    "paycor": _PAYCOR_MAP,
}


def normalize_weekly_rows(
    raw_rows: list[dict[str, Any]], source: str = "native"
) -> list[dict[str, Any]]:
    """Map vendor export columns to our canonical import columns.

    ``source="native"`` (default) returns rows unchanged (already our template).
    ``source="zenoti"|"paycor"`` remaps recognised headers; unmapped columns are
    preserved so nothing is silently dropped.
    """
    source = (source or "native").strip().lower()
    if source == "native" or source not in SOURCE_MAPS:
        return raw_rows

    mapping = SOURCE_MAPS[source]
    out: list[dict[str, Any]] = []
    for raw in raw_rows:
        lowered = {str(k).strip().lower(): v for k, v in raw.items()}
        mapped: dict[str, Any] = dict(raw)  # keep originals as a fallback
        for canonical, candidates in mapping.items():
            for cand in candidates:
                if cand in lowered and lowered[cand] not in (None, ""):
                    mapped[canonical] = lowered[cand]
                    break
        out.append(mapped)
    return out


# ── Future live API hooks (stubs) ────────────────────────────────────────────

def fetch_zenoti_week(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
    """Placeholder for a live Zenoti API pull. Returns [] until wired."""
    raise NotImplementedError("Live Zenoti API integration not configured. Use CSV import.")


def fetch_paycor_week(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
    """Placeholder for a live PayCor API pull. Returns [] until wired."""
    raise NotImplementedError("Live PayCor API integration not configured. Use CSV import.")


# ── Bulk user provisioning ───────────────────────────────────────────────────

def _resolve_salon(session: Session, salon_id: int | None, salon_name: str | None,
                   cache: dict[str, Salon | None]) -> Salon | None:
    if salon_id is not None:
        return session.get(Salon, salon_id)
    if salon_name:
        key = salon_name.strip().lower()
        if key in cache:
            return cache[key]
        salon = session.exec(select(Salon)).all()
        found = next((s for s in salon if s.name.strip().lower() == key), None)
        cache[key] = found
        return found
    return None


def bulk_create_users(
    session: Session,
    rows: list[dict[str, Any]],
    *,
    email_credentials: bool = False,
) -> BulkUserResult:
    """Create/update users from parsed CSV rows.

    Rows are keyed by ``email``. Existing emails are updated (role/salon/manager/
    name); new emails are created with a generated temp password. ``manager_id``
    or ``manager_email`` resolve the reporting line. Returns a summary with any
    generated credentials (unless ``email_credentials`` sends them instead).
    """
    from app.services.notifications_out import send_welcome_email

    result = BulkUserResult()
    salon_cache: dict[str, Salon | None] = {}

    for i, raw in enumerate(rows, start=2):  # header is row 1
        email = (str(raw.get("email")).strip() if raw.get("email") else None)
        name = (str(raw.get("name")).strip() if raw.get("name") else None)
        if not email or not name:
            result.skipped += 1
            result.errors.append(f"Row {i}: email and name are required")
            continue

        role_raw = str(raw.get("role") or "stylist").strip().lower()
        try:
            role = UserRole(role_raw)
        except ValueError:
            result.skipped += 1
            result.errors.append(f"Row {i}: invalid role '{role_raw}'")
            continue

        salon_id_raw = raw.get("salon_id")
        salon_id = int(salon_id_raw) if str(salon_id_raw or "").strip().isdigit() else None
        salon = _resolve_salon(session, salon_id, raw.get("salon_name"), salon_cache)
        if salon is None:
            result.skipped += 1
            result.errors.append(
                f"Row {i}: could not resolve salon (salon_id={salon_id_raw}, "
                f"salon_name={raw.get('salon_name')!r})"
            )
            continue

        # Resolve manager by id or email.
        manager_id = None
        mid_raw = raw.get("manager_id")
        if str(mid_raw or "").strip().isdigit():
            manager_id = int(mid_raw)
        elif raw.get("manager_email"):
            mgr = session.exec(
                select(User).where(User.email == str(raw["manager_email"]).strip())
            ).first()
            manager_id = mgr.id if mgr else None

        guarantee = raw.get("guarantee_rate")
        try:
            guarantee = float(guarantee) if str(guarantee or "").strip() else None
        except (TypeError, ValueError):
            guarantee = None

        existing = session.exec(select(User).where(User.email == email)).first()
        if existing is not None:
            existing.name = name
            existing.role = role
            existing.salon_id = salon.id
            if manager_id is not None:
                existing.manager_id = manager_id
            if raw.get("title"):
                existing.title = str(raw["title"]).strip()
            if raw.get("phone"):
                existing.phone = str(raw["phone"]).strip()
            if guarantee is not None:
                existing.guarantee_rate = guarantee
            session.add(existing)
            result.updated += 1
            continue

        password = (str(raw.get("password")).strip() if raw.get("password") else None) \
            or security.generate_temp_password()
        user = User(
            name=name,
            email=email,
            role=role,
            salon_id=salon.id,
            manager_id=manager_id,
            title=(str(raw["title"]).strip() if raw.get("title") else None),
            phone=(str(raw["phone"]).strip() if raw.get("phone") else None),
            guarantee_rate=guarantee,
            hashed_password=security.hash_password(password),
            is_active=True,
        )
        session.add(user)
        result.created += 1
        if email_credentials:
            send_welcome_email(email, name, temp_password=password)
        else:
            result.credentials[email] = password

    session.commit()
    return result

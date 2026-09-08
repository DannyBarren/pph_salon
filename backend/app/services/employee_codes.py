"""Employee-code normalize + lookup (shared by user CRUD and daily import).

Canonical stored form matches the existing roster/importer convention:
``VG-1426``, ``vg 1426``, and ``VG1426`` all become ``VG1426``. Matching
accepts hyphen/space variants so a newly created stylist is found by the
Venita daily export.
"""

from __future__ import annotations

import re

from sqlmodel import Session, select

from app.models import User

_LETTER_THEN_DIGITS = re.compile(r"^([A-Z]+)(\d+)$")


def normalize_employee_code(raw: object | None) -> str | None:
    """Trim, drop hyphen/space, uppercase. Empty → None."""
    if raw is None:
        return None
    compact = str(raw).strip().replace("-", "").replace(" ", "").upper()
    return compact or None


def employee_code_match_values(raw: object | None) -> set[str]:
    """Stored forms that should match ``raw`` (importer convention + hyphen)."""
    if raw is None:
        return set()
    s = str(raw).strip()
    if not s:
        return set()
    compact = s.replace("-", "").replace(" ", "")
    upper = compact.upper()
    values = {s, compact, upper, compact.lower()}
    hyphenated = _LETTER_THEN_DIGITS.match(upper)
    if hyphenated:
        values.add(f"{hyphenated.group(1)}-{hyphenated.group(2)}")
    return {v for v in values if v}


def find_user_by_employee_code(
    session: Session,
    raw: object | None,
    *,
    exclude_id: int | None = None,
    salon_id: int | None = None,
) -> User | None:
    """Find a user whose stored code matches ``raw`` (hyphen optional).

    When ``salon_id`` is set, only that salon is searched (create/update clash).
    When it is None, keep the global first-match used by daily/weekly import
    fallback — do not change import routing.
    """
    codes = employee_code_match_values(raw)
    if not codes:
        return None
    stmt = select(User).where(User.employee_code.in_(codes)).order_by(User.id)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    if salon_id is not None:
        stmt = stmt.where(User.salon_id == salon_id)
    found = session.exec(stmt).first()
    if found is not None:
        return found
    canonical = normalize_employee_code(raw)
    if not canonical:
        return None
    scan = select(User).where(User.employee_code.is_not(None))
    if salon_id is not None:
        scan = scan.where(User.salon_id == salon_id)
    users = session.exec(scan).all()
    for user in users:
        if exclude_id is not None and user.id == exclude_id:
            continue
        if normalize_employee_code(user.employee_code) == canonical:
            return user
    return None

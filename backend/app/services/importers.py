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

import re
from datetime import date
from typing import Any

from sqlmodel import Session, select

from app.core import security
from app.models import Salon, User, UserRole
from app.schemas.user import BulkUserResult
from app.schemas.weekly import ClientImportResult, WeeklyDataInput
from app.services.weekly_repo import (
    get_salon_by_name,
    upsert_weekly_data_by_user_and_week,
)

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

# The real client / Salon Success (SSF) roster + weekly-performance export. One
# file provisions salons + users AND carries a week of production. See
# ``import_client_export`` for the combined pipeline. Net service Rev arrives in
# an Excel "accounting" format (e.g. ``_($* 2418.15_)``) parsed by ``parse_money``.
_CLIENT_EXPORT_MAP = {
    "salon_code": ["salon"],
    "salon_name": ["salon name"],
    "employee_code": ["employee code", "emp code", "employee id"],
    "name": ["employee name", "name"],
    "position": ["position", "role", "title"],
    "guarantee_rate": ["guaranteed pay-rate", "guaranteed pay rate", "guarantee rate", "guaranteed payrate"],
    "scheduled_hrs": ["scheduled hours", "scheduled hrs", "sched hours"],
    "actual_hrs": ["hours worked", "worked hours", "actual hours"],
    "net_service_rev": ["net service rev", "net service revenue", "net rev", "service revenue"],
    "avg_haircut": ["avg haircut", "average haircut", "haircut price"],
    "avg_color": ["avg color", "average color", "color price"],
    "excluded": ["excl?", "excluded", "exclude", "exclusion", "excl"],
}

SOURCE_MAPS: dict[str, dict[str, list[str]]] = {
    "zenoti": _ZENOTI_MAP,
    "paycor": _PAYCOR_MAP,
    "client_export": _CLIENT_EXPORT_MAP,
    "ssff": _CLIENT_EXPORT_MAP,
}

# The client's daily "Data provided to App" format. Canonical keys → the client's
# headers (plus the legacy canonical names for backwards compatibility). Note
# ``service_rev`` (Act Svc Rev($)) is the AUTHORITATIVE daily service revenue and
# is kept distinct from the legacy additive ``actual_other_value``.
_APP_DAILY_MAP = {
    "salon_name": ["salon name", "salon", "salon_name", "salon location", "salon_location", "location"],
    "user_id": ["eeid", "ee id", "employee id", "employee_id", "employee code", "employee_code", "emp id", "user_id", "user id"],
    "name": ["ee name", "employee name", "name"],
    # ``Include/Exclude`` (client v2) as well as the older ``Excl?`` flag.
    "excluded": ["excl?", "excluded", "excl", "exclude", "include/exclude", "include_exclude", "includeexclude", "inc/exc"],
    # The client v2 file names the date column "week_start / sale_date"; accept both.
    "date": ["date", "sale_date", "sale date", "week_start", "week start", "work_date", "work date"],
    "scheduled_hrs": ["sched hrs", "sched. hrs", "scheduled hrs", "scheduled hours", "sched hours", "scheduled_hrs"],
    "actual_hrs": ["actual hrs", "actual hours", "hours worked", "worked hours", "actual_hrs"],
    # ``service_revenue``/``actual_other_value`` (client v2) is the AUTHORITATIVE
    # daily service revenue. ``Service Sale`` is the same figure in the client's
    # raw per-day export (the layout they send straight out of their reporting
    # tool, e.g. "PPH Data 07-06-2026 TO 07-19-2026.xlsx").
    "service_rev": [
        "act svc rev($)", "act svc rev ($)", "act svc rev", "actual service revenue",
        "actual svc rev", "service revenue", "service_revenue", "svc rev", "service_rev",
        "service sale", "service sales", "service_sale", "svc sale", "net service rev",
    ],
    "actual_haircuts": ["act cuts count", "act cuts", "actual cuts", "cuts", "haircuts", "haircut", "actual_haircuts"],
    "actual_colors": ["act colors count", "act colors", "actual colors", "colors", "color", "actual_colors"],
    "actual_other_value": ["actual_other_value", "other value", "other revenue"],
}


def _lowered_alias_map(raw: dict[str, Any]) -> dict[str, Any]:
    """Lowercased header→value lookup that also splits multi-name headers.

    Some client exports put two acceptable column names in a single header cell
    separated by a newline (e.g. ``"week_start\\nsale_date"`` or
    ``"actual_other_value\\nservice_revenue"``). We index the full lowered key
    AND each newline-separated token so either name resolves.
    """
    out: dict[str, Any] = {}
    for key, value in raw.items():
        base = str(key).strip().lower()
        out.setdefault(base, value)
        for part in re.split(r"[\n\r]+", base):
            token = part.strip()
            if token:
                out.setdefault(token, value)
    return out


def normalize_daily_rows(
    raw_rows: list[dict[str, Any]], source: str = "native"
) -> list[dict[str, Any]]:
    """Map the daily import file onto our canonical daily columns.

    The default (``native``) accepts every daily layout the client has sent:

    * the v2 per-day template — ``employee_id | salon_name | week_start/sale_date
      | scheduled_hrs | actual_hrs | actual_haircuts | actual_colors |
      actual_other_value/service_revenue | Employee Name | pay_period |
      Include/Exclude``;
    * their raw per-day export — ``Salon Name | Employee ID | Employee Name |
      Sale Date | Scheduled Hours | Actual Hours | Service Sale | Haircuts |
      Color | Include/Exclude``;
    * the older "Data provided to App" layout — ``Salon | EEID | … | Act Svc
      Rev($) | Act Cuts Count | Act Colors Count``.

    Recognised headers (and sensible aliases, including two-names-in-one-cell
    headers) map to canonical keys; originals are preserved so nothing is
    silently dropped. ``zenoti``/``paycor`` delegate to the weekly vendor maps.
    """
    source = (source or "native").strip().lower()
    if source in ("zenoti", "paycor"):
        return normalize_weekly_rows(raw_rows, source)

    out: list[dict[str, Any]] = []
    for raw in raw_rows:
        lowered = _lowered_alias_map(raw)
        mapped: dict[str, Any] = dict(raw)  # keep originals as a fallback
        for canonical, candidates in _APP_DAILY_MAP.items():
            for cand in candidates:
                if cand in lowered and lowered[cand] not in (None, ""):
                    mapped[canonical] = lowered[cand]
                    break
        out.append(mapped)
    return out

# Aliases that all mean "the real client export" for the source selector.
CLIENT_EXPORT_SOURCES = {"client_export", "ssff", "ssf", "client"}


def parse_money(value: Any) -> float | None:
    """Parse a currency amount from messy real-world exports.

    Handles plain numbers, ``$1,234.56``, and Excel accounting format such as
    ``_($* 2418.15_)`` (the format *code* leaks into CSV exports — the ``_(``/
    ``_)`` are spacing placeholders, NOT a negative sign). Returns ``None`` for
    blank/uninterpretable input. Revenue is never negative here, so we simply
    strip everything that is not a digit, dot or minus.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", s)
    # Guard against stray separators leaving something unparseable.
    if cleaned in ("", "-", ".", "-.", "--"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_bool(value: Any) -> bool:
    """Parse a truthy flag from messy CSV input (Y/N, yes/no, true/false, 1/0)."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    # Note: "include" is intentionally falsy so an Include/Exclude column maps
    # Exclude→True and Include→False.
    return str(value).strip().lower() in {"y", "yes", "true", "t", "1", "x", "excluded", "exclude"}


def _looks_like_client_export(raw_rows: list[dict[str, Any]]) -> bool:
    """Heuristic: detect the client roster+performance export by its headers."""
    if not raw_rows:
        return False
    headers = {str(k).strip().lower() for k in raw_rows[0]}
    return "employee code" in headers and (
        "net service rev" in headers or "guaranteed pay-rate" in headers
    )


def _map_role(position: Any) -> UserRole:
    """Map the export's Position column onto a UserRole (defaults to stylist)."""
    p = str(position or "").strip().lower()
    if p.startswith("manager") or p in {"gm", "general manager", "salon manager"}:
        return UserRole.manager
    if p in {"owner", "sdl"}:
        return UserRole.owner
    if p in {"admin", "administrator"}:
        return UserRole.admin
    return UserRole.stylist


def normalize_weekly_rows(
    raw_rows: list[dict[str, Any]], source: str = "native"
) -> list[dict[str, Any]]:
    """Map vendor export columns to our canonical import columns.

    ``source="native"`` (default) returns rows unchanged (already our template).
    ``source="zenoti"|"paycor"`` remaps recognised headers; unmapped columns are
    preserved so nothing is silently dropped.
    """
    source = (source or "native").strip().lower()
    if source in CLIENT_EXPORT_SOURCES:
        source = "client_export"

    # Auto-detect the client export even when the caller left source="native",
    # so a straight upload of the real file still normalises correctly.
    if source in ("native", "") and _looks_like_client_export(raw_rows):
        source = "client_export"

    if source == "native" or source not in SOURCE_MAPS:
        return raw_rows

    mapping = SOURCE_MAPS[source]
    is_client = source == "client_export"
    out: list[dict[str, Any]] = []
    for raw in raw_rows:
        lowered = {str(k).strip().lower(): v for k, v in raw.items()}
        mapped: dict[str, Any] = dict(raw)  # keep originals as a fallback
        for canonical, candidates in mapping.items():
            for cand in candidates:
                if cand in lowered and lowered[cand] not in (None, ""):
                    mapped[canonical] = lowered[cand]
                    break
        if is_client:
            # Net service Rev is the total production for the week; store the
            # parsed dollar amount in ``actual_other_value`` so the shared
            # production-derivation path (weekly_repo) picks it up unchanged.
            rev = parse_money(mapped.get("net_service_rev"))
            if rev is not None:
                mapped["actual_other_value"] = rev
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
    creator: User | None = None,
    email_credentials: bool = False,
) -> BulkUserResult:
    """Create/update users from parsed CSV rows, scoped to ``creator``'s authority.

    Rows are keyed by ``email``. Existing emails are updated (role/salon/manager/
    name); new emails are created with a generated temp password. ``manager_id``
    or ``manager_email`` resolve the reporting line. Returns a summary with any
    generated credentials (unless ``email_credentials`` sends them instead).

    Delegated provisioning: a **super-admin** creator may import any role into any
    salon. A **manager** creator may import only stylists into their own salon,
    and every imported stylist is auto-assigned to report to that manager — any
    row that violates this is skipped with an explanatory error.
    """
    from app.api.deps import (  # local to avoid cycle
        assert_can_create_user,
        is_admin,
        is_super_admin,
    )
    from app.services.notifications_out import send_welcome_email

    result = BulkUserResult()
    salon_cache: dict[str, Salon | None] = {}
    creator_is_super = creator is None or is_super_admin(creator)

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

        # Managers are confined to stylists in their own salon.
        if not creator_is_super and creator is not None:
            role = UserRole.stylist if role == UserRole.stylist else role
            try:
                assert_can_create_user(creator, role, creator.salon_id)
            except Exception:  # noqa: BLE001 - convert perm error into a skipped row
                result.skipped += 1
                result.errors.append(
                    f"Row {i}: you can only import stylists into your own salon"
                )
                continue

        salon_id_raw = raw.get("salon_id")
        salon_id = int(salon_id_raw) if str(salon_id_raw or "").strip().isdigit() else None
        if not creator_is_super and creator is not None:
            salon = session.get(Salon, creator.salon_id)
        else:
            salon = _resolve_salon(session, salon_id, raw.get("salon_name"), salon_cache)
        if salon is None:
            result.skipped += 1
            result.errors.append(
                f"Row {i}: could not resolve salon (salon_id={salon_id_raw}, "
                f"salon_name={raw.get('salon_name')!r})"
            )
            continue

        # Resolve manager by id or email (managers always own their reports).
        manager_id = None
        if not creator_is_super and creator is not None:
            manager_id = creator.id
        else:
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

        has_excluded = str(raw.get("excluded", "")).strip() != ""
        excluded = parse_bool(raw.get("excluded"))

        existing = session.exec(select(User).where(User.email == email)).first()
        if existing is not None:
            # A non-super creator may only touch subordinates in their own salon.
            if not creator_is_super and creator is not None and (
                existing.salon_id != creator.salon_id or existing.role != UserRole.stylist
            ):
                result.skipped += 1
                result.errors.append(
                    f"Row {i}: '{email}' is not a stylist you manage — skipped"
                )
                continue
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
            # Only Admin may turn PPH on/off for an EXISTING person — a manager's
            # CSV must never silently un-exclude (or exclude) anyone. The column
            # is still honored on CREATE (explicit creator choice) and for admin
            # imports.
            if has_excluded and (creator is None or is_admin(creator)):
                existing.excluded = excluded
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
            excluded=excluded,
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


# ── Combined client-export import (salons + users + weekly performance) ───────

def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _num(value: Any) -> float | None:
    """Parse a plain numeric cell (hours, rate). Tolerates $/commas via parse_money."""
    return parse_money(value)


def _resolve_or_create_salon(
    session: Session,
    salon_code: str | None,
    salon_name: str,
    row: dict[str, Any],
    cache: dict[str, Salon],
    default_haircut_price: float,
    default_color_price: float,
) -> tuple[Salon, bool]:
    """Resolve a salon by its stable code (stored in ``location``) or display
    name, creating it if missing. Service prices come from Avg Haircut / Avg
    Color (falling back to the workbook defaults 23/85)."""
    key = (salon_code or salon_name).strip().lower()
    if key in cache:
        return cache[key], False

    salon: Salon | None = None
    if salon_code:
        salon = session.exec(select(Salon).where(Salon.location == salon_code)).first()
    if salon is None:
        salon = get_salon_by_name(session, salon_name)

    haircut_price = _num(row.get("avg_haircut")) or default_haircut_price
    color_price = _num(row.get("avg_color")) or default_color_price
    prices = {"haircut": float(haircut_price), "color": float(color_price)}

    created = False
    if salon is None:
        salon = Salon(
            name=salon_name,
            city=salon_name,
            location=salon_code,
            service_prices=prices,
        )
        session.add(salon)
        session.flush()  # assign id for downstream user/week writes
        created = True
    else:
        # Keep the stable code + prices in sync on re-import.
        if salon_code and salon.location != salon_code:
            salon.location = salon_code
        salon.service_prices = prices
        session.add(salon)

    cache[key] = salon
    return salon, created


def _resolve_or_create_user(
    session: Session,
    salon: Salon,
    employee_code: str | None,
    name: str | None,
    row: dict[str, Any],
) -> tuple[User, bool]:
    """Resolve a user within ``salon`` by ``employee_code`` (preferred) or name,
    creating them if missing. Employee codes are unique only per salon."""
    role = _map_role(row.get("position"))
    guarantee = _num(row.get("guarantee_rate"))
    excluded = parse_bool(row.get("excluded"))

    user: User | None = None
    if employee_code:
        user = session.exec(
            select(User).where(
                User.salon_id == salon.id, User.employee_code == employee_code
            )
        ).first()
    if user is None and name:
        user = session.exec(
            select(User).where(User.salon_id == salon.id, User.name == name)
        ).first()

    if user is None:
        user = User(
            name=name or employee_code or "Unknown",
            role=role,
            salon_id=salon.id,
            employee_code=employee_code,
            guarantee_rate=guarantee,
            excluded=excluded,
            is_active=True,
        )
        session.add(user)
        session.flush()
        return user, True

    # Idempotent update on re-import.
    if name:
        user.name = name
    user.role = role
    if employee_code:
        user.employee_code = employee_code
    if guarantee is not None:
        user.guarantee_rate = guarantee
    user.excluded = excluded
    session.add(user)
    return user, False


def _link_salon_managers(session: Session, salon_ids: set[int]) -> None:
    """For each touched salon, point stylists (with no manager) at the salon's
    manager so the team hierarchy works out of the box."""
    for sid in salon_ids:
        members = list(session.exec(select(User).where(User.salon_id == sid)).all())
        manager = next((u for u in members if u.role == UserRole.manager), None)
        if manager is None:
            continue
        for u in members:
            if u.id != manager.id and u.role == UserRole.stylist and u.manager_id is None:
                u.manager_id = manager.id
                session.add(u)


def import_client_export(
    session: Session,
    raw_rows: list[dict[str, Any]],
    *,
    week_start: date,
    week_end: date | None = None,
    default_haircut_price: float = 23.0,
    default_color_price: float = 85.0,
) -> ClientImportResult:
    """Import the real client roster + weekly-performance export in one pass.

    For every row this will, idempotently:

    1. Resolve/create the **salon** (by its stable code or display name) and set
       its service prices from Avg Haircut / Avg Color.
    2. Resolve/create the **user** within that salon (by employee code or name),
       mapping Position → role and storing the per-employee guarantee rate.
    3. Upsert that user's **week** for ``week_start`` with scheduled/worked hours
       and Net service Rev (stored so weekly production = the net revenue).

    Finally, stylists are linked to their salon's manager. Safe to re-run: the
    same file re-imported updates in place rather than duplicating.
    """
    rows = normalize_weekly_rows(raw_rows, "client_export")
    result = ClientImportResult(week_start=week_start)
    salon_cache: dict[str, Salon] = {}
    touched_salons: set[int] = set()

    for i, raw in enumerate(rows, start=2):  # header is row 1
        try:
            employee_code = _clean_str(raw.get("employee_code"))
            name = _clean_str(raw.get("name"))
            salon_code = _clean_str(raw.get("salon_code"))
            salon_name = _clean_str(raw.get("salon_name")) or salon_code

            # Skip genuinely blank rows silently.
            if not any((employee_code, name, salon_code, salon_name)):
                continue
            if not salon_name:
                raise ValueError("missing Salon / Salon Name")
            if not (employee_code or name):
                raise ValueError("missing Employee code / Employee Name")

            salon, salon_created = _resolve_or_create_salon(
                session, salon_code, salon_name, raw, salon_cache,
                default_haircut_price, default_color_price,
            )
            if salon_created:
                result.salons_created += 1
            touched_salons.add(salon.id)

            user, user_created = _resolve_or_create_user(
                session, salon, employee_code, name, raw
            )
            if user_created:
                result.users_created += 1
            else:
                result.users_updated += 1

            data = WeeklyDataInput(
                scheduled_hrs=_num(raw.get("scheduled_hrs")) or 0.0,
                actual_hrs=_num(raw.get("actual_hrs")),
                actual_other_value=parse_money(raw.get("net_service_rev")),
                week_end=week_end,
            )
            _, wk_created = upsert_weekly_data_by_user_and_week(
                session, user.id, week_start, data, commit=False
            )
            if wk_created:
                result.weeks_inserted += 1
            else:
                result.weeks_updated += 1
        except Exception as exc:  # noqa: BLE001 — one bad row never fails the batch
            result.skipped += 1
            result.errors.append(f"Row {i}: {exc}")
            continue

    _link_salon_managers(session, touched_salons)
    session.commit()
    return result

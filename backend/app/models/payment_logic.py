"""Global payment-logic configuration — the single source of truth.

There is exactly **one** row in this table (``id == 1``) and it fully controls
every calculation that produces the numbers shown to any user (stylists,
managers, admins). It is organisation-wide: there are intentionally **no**
per-salon or per-user overrides of the core tier/calculation rules.

The row is seeded on first access from the defaults in
``app.services.pay_engine`` (``DEFAULT_PPH_TIERS``, ``DEFAULT_NP_RATE`` …) via
:func:`app.services.payment_logic.get_or_create_config`.

Only the highest admin (Owner) may change it — see
``app.api.v1.payment_logic``.
"""

from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin

# The fixed primary key of the single global config row.
GLOBAL_CONFIG_ID = 1


class PaymentLogicConfig(TimestampMixin, table=True):
    """The one global payment-logic configuration row."""

    __tablename__ = "payment_logic_config"

    id: Optional[int] = Field(default=GLOBAL_CONFIG_ID, primary_key=True)

    # ── The payment tier table (pay_rate <-> pph_required) ──────────────────
    # Stored as a JSON list of {"pay_rate": float, "pph_required": float},
    # sorted ascending by pay_rate.
    tiers: list[dict] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )

    # ── Core rates & parameters ─────────────────────────────────────────────
    # Net-production share used to derive off-tier PPH and the guarantee floor.
    np_rate: float = Field(default=0.4)
    # Net-profit percentage surfaced on reports (informational).
    np_percent: float = Field(default=0.195)
    # Global hourly guarantee floor ($/hr) — the single org-wide default.
    guarantee_rate: float = Field(default=12.0)
    # Net-production commission share used for the commission-vs-guarantee split.
    commission_rate: float = Field(default=0.4)

    # Per-service production values ($). These are the canonical service prices
    # used across production <-> service-count math.
    haircut_price: float = Field(default=23.0)
    color_price: float = Field(default=85.0)

    # Average ticket values used when projecting production into service counts
    # (mirror the service prices by default).
    avg_ticket_haircut: float = Field(default=23.0)
    avg_ticket_color: float = Field(default=85.0)

    # Fraction (0-1) of projected future services assumed to be haircuts.
    service_mix_haircut: float = Field(default=0.6)
    # Minimum expected services per scheduled day (feasibility checks).
    min_services_per_day: float = Field(default=6.0)

    # Who last changed the global logic (denormalised for the audit trail).
    updated_by_id: Optional[int] = Field(default=None)
    updated_by_email: Optional[str] = Field(default=None)

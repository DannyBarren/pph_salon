"""Schemas for weekly data entry + bulk import.

These mirror the columns of the downloadable import template and the manual
Admin "Data Management" form. ``WeeklyDataInput`` is the canonical upsert payload
keyed by ``user_id`` + ``week_start``.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class WeeklyDataInput(BaseModel):
    """One stylist-week of data (matches the import template columns)."""

    scheduled_hrs: float = Field(default=0.0, ge=0)
    actual_hrs: float | None = Field(default=None, ge=0)
    actual_haircuts: int | None = Field(default=None, ge=0)
    actual_colors: int | None = Field(default=None, ge=0)
    actual_other_value: float | None = Field(default=None, ge=0)
    week_end: date | None = None
    notes: str | None = None


class WeeklyImportRow(WeeklyDataInput):
    """A single row of the bulk import file (adds routing/identity columns).

    ``employee_id`` (the client Employee code or our numeric user id) is the
    routing key; ``salon_name`` is informational. ``user_id`` is the resolved
    internal id used for the upsert.
    """

    user_id: int
    employee_id: str | None = None
    week_start: date
    salon_name: str | None = None
    guarantee_rate: float | None = Field(default=None, ge=0)


class SkippedEmployee(BaseModel):
    """One unknown person from a daily/weekly import (not auto-created)."""

    name: str | None = None
    employee_code: str | None = None
    salon_name: str | None = None


class WeeklyImportResult(BaseModel):
    """Summary returned by the bulk import endpoint."""

    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = []
    skipped_employees: list[SkippedEmployee] = []
    period_start: date | None = None
    period_end: date | None = None


class ClientImportResult(BaseModel):
    """Summary returned by the combined client-export import.

    The client export is a single file that provisions salons and users AND
    carries a week of performance data, so the result reports each dimension.
    """

    week_start: date
    salons_created: int = 0
    users_created: int = 0
    users_updated: int = 0
    weeks_inserted: int = 0
    weeks_updated: int = 0
    skipped: int = 0
    errors: list[str] = []
    # Employee codes that could not be resolved/created, for quick triage.
    credentials: dict[str, str] = {}


class WeeklyDataRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stylist_id: int
    week_start: date
    week_end: date | None = None
    scheduled_total_hrs: float
    actual_total_hrs: float | None = None
    actual_production: float | None = None
    actual_haircuts: int | None = None
    actual_colors: int | None = None
    actual_other_value: float | None = None
    notes: str | None = None

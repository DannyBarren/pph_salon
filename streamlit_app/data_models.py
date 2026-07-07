"""Persistence layer (SQLite for the MVP, easy to swap for Postgres later).

Tables
------
* ``salon``       — name + per-service prices ($23 haircut / $85 color defaults).
* ``app_user``    — stylists / managers / admins, each with a guarantee pay rate.
* ``weekly_data`` — one row per (user, week_start); daily arrays stored as JSON.

The daily arrays (7 values, Mon→Sun) keep the app aligned with the workbook's
per-day columns. Everything goes through small repository functions so the store
can be re-pointed at Postgres by changing only ``_connect``.
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field

DB_PATH = os.environ.get("PPH_DB_PATH", os.path.join(os.path.dirname(__file__), "pph.db"))

# ── Domain dataclasses ───────────────────────────────────────────────────────


@dataclass
class Salon:
    id: str
    name: str
    haircut_price: float = 23.0
    color_price: float = 85.0


@dataclass
class User:
    id: str
    name: str
    role: str  # "stylist" | "manager" | "admin"
    salon_id: str
    guarantee_rate: float = 12.0
    email: str = ""


@dataclass
class WeeklyData:
    user_id: str
    week_start: str  # ISO date of the Monday
    scheduled_hours: list[float] = field(default_factory=lambda: [0.0] * 7)
    actual_hours: list[float] = field(default_factory=lambda: [0.0] * 7)
    haircuts: list[int] = field(default_factory=lambda: [0] * 7)
    colors: list[int] = field(default_factory=lambda: [0] * 7)
    production: list[float] = field(default_factory=lambda: [0.0] * 7)
    notes: str = ""

    @property
    def total_scheduled(self) -> float:
        return round(sum(self.scheduled_hours), 4)

    @property
    def total_actual(self) -> float:
        return round(sum(self.actual_hours), 4)

    @property
    def total_production(self) -> float:
        return round(sum(self.production), 2)

    @property
    def total_haircuts(self) -> int:
        return int(sum(self.haircuts))

    @property
    def total_colors(self) -> int:
        return int(sum(self.colors))


# ── Connection + schema ──────────────────────────────────────────────────────


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(seed: bool = True) -> None:
    """Create tables if missing and (optionally) load the demo seed data."""
    conn = _connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS salon (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                haircut_price REAL NOT NULL DEFAULT 23,
                color_price REAL NOT NULL DEFAULT 85
            );
            CREATE TABLE IF NOT EXISTS app_user (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                salon_id TEXT NOT NULL,
                guarantee_rate REAL NOT NULL DEFAULT 12,
                email TEXT DEFAULT '',
                FOREIGN KEY (salon_id) REFERENCES salon(id)
            );
            CREATE TABLE IF NOT EXISTS weekly_data (
                user_id TEXT NOT NULL,
                week_start TEXT NOT NULL,
                scheduled_hours TEXT NOT NULL,
                actual_hours TEXT NOT NULL,
                haircuts TEXT NOT NULL,
                colors TEXT NOT NULL,
                production TEXT NOT NULL,
                notes TEXT DEFAULT '',
                PRIMARY KEY (user_id, week_start)
            );
            """
        )
        conn.commit()
    finally:
        conn.close()

    if seed:
        from seed_data import seed_if_empty

        seed_if_empty()


# ── Salon repository ─────────────────────────────────────────────────────────


def upsert_salon(salon: Salon) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO salon (id, name, haircut_price, color_price) VALUES (?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, "
            "haircut_price=excluded.haircut_price, color_price=excluded.color_price",
            (salon.id, salon.name, salon.haircut_price, salon.color_price),
        )
        conn.commit()
    finally:
        conn.close()


def get_salon(salon_id: str) -> Salon | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM salon WHERE id=?", (salon_id,)).fetchone()
        return _row_to_salon(row) if row else None
    finally:
        conn.close()


def list_salons() -> list[Salon]:
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM salon ORDER BY name").fetchall()
        return [_row_to_salon(r) for r in rows]
    finally:
        conn.close()


# ── User repository ──────────────────────────────────────────────────────────


def upsert_user(user: User) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO app_user (id, name, role, salon_id, guarantee_rate, email) "
            "VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, "
            "role=excluded.role, salon_id=excluded.salon_id, "
            "guarantee_rate=excluded.guarantee_rate, email=excluded.email",
            (user.id, user.name, user.role, user.salon_id, user.guarantee_rate, user.email),
        )
        conn.commit()
    finally:
        conn.close()


def get_user(user_id: str) -> User | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM app_user WHERE id=?", (user_id,)).fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def list_users(role: str | None = None) -> list[User]:
    conn = _connect()
    try:
        if role:
            rows = conn.execute("SELECT * FROM app_user WHERE role=? ORDER BY name", (role,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM app_user ORDER BY name").fetchall()
        return [_row_to_user(r) for r in rows]
    finally:
        conn.close()


def get_stylists_by_salon(salon_id: str) -> list[User]:
    """All stylists in a salon (a manager's team)."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM app_user WHERE salon_id=? AND role='stylist' ORDER BY name",
            (salon_id,),
        ).fetchall()
        return [_row_to_user(r) for r in rows]
    finally:
        conn.close()


# ── Weekly-data repository ───────────────────────────────────────────────────


def upsert_weekly_data(data: WeeklyData) -> None:
    """Idempotent upsert keyed by (user_id, week_start) — matches the import key."""
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO weekly_data "
            "(user_id, week_start, scheduled_hours, actual_hours, haircuts, colors, production, notes) "
            "VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id, week_start) DO UPDATE SET "
            "scheduled_hours=excluded.scheduled_hours, actual_hours=excluded.actual_hours, "
            "haircuts=excluded.haircuts, colors=excluded.colors, "
            "production=excluded.production, notes=excluded.notes",
            (
                data.user_id,
                data.week_start,
                json.dumps(data.scheduled_hours),
                json.dumps(data.actual_hours),
                json.dumps(data.haircuts),
                json.dumps(data.colors),
                json.dumps(data.production),
                data.notes,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_weekly_data(user_id: str, week_start: str) -> WeeklyData | None:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT * FROM weekly_data WHERE user_id=? AND week_start=?",
            (user_id, week_start),
        ).fetchone()
        return _row_to_weekly(row) if row else None
    finally:
        conn.close()


def list_weeks(user_id: str) -> list[str]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT week_start FROM weekly_data WHERE user_id=? ORDER BY week_start DESC",
            (user_id,),
        ).fetchall()
        return [r["week_start"] for r in rows]
    finally:
        conn.close()


def all_week_starts() -> list[str]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT DISTINCT week_start FROM weekly_data ORDER BY week_start DESC"
        ).fetchall()
        return [r["week_start"] for r in rows]
    finally:
        conn.close()


# ── Row mappers ──────────────────────────────────────────────────────────────


def _row_to_salon(r: sqlite3.Row) -> Salon:
    return Salon(id=r["id"], name=r["name"], haircut_price=r["haircut_price"], color_price=r["color_price"])


def _row_to_user(r: sqlite3.Row) -> User:
    return User(
        id=r["id"], name=r["name"], role=r["role"], salon_id=r["salon_id"],
        guarantee_rate=r["guarantee_rate"], email=r["email"] or "",
    )


def _row_to_weekly(r: sqlite3.Row) -> WeeklyData:
    return WeeklyData(
        user_id=r["user_id"],
        week_start=r["week_start"],
        scheduled_hours=json.loads(r["scheduled_hours"]),
        actual_hours=json.loads(r["actual_hours"]),
        haircuts=json.loads(r["haircuts"]),
        colors=json.loads(r["colors"]),
        production=json.loads(r["production"]),
        notes=r["notes"] or "",
    )

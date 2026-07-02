#!/usr/bin/env python3
"""Seed script placeholder for the PPH Stylist App database.

This is intentionally a scaffold. Once the SQLAlchemy models and session are
implemented in `backend/app/`, flesh out `seed()` to insert realistic demo data
(salons, users across the role hierarchy, and daily production records) that
mirrors the mock data currently used by the frontend
(`frontend/src/lib/mockData.ts`).

Usage (once implemented):
    # with the backend virtualenv active and the DB running:
    python scripts/seed.py
"""

from __future__ import annotations

# Illustrative shape of the demo dataset to insert. Keep in sync with
# frontend/src/lib/mockData.ts so the API and the mock UI tell the same story.
DEMO_SALONS = [
    {"id": "s1", "name": "Aria Studio", "city": "Downtown", "guarantee_rate": 17.0},
    {"id": "s2", "name": "Lumière Salon", "city": "Westside", "guarantee_rate": 16.0},
    {"id": "s3", "name": "Maven Hair Co.", "city": "Uptown", "guarantee_rate": 15.0},
]

DEMO_USERS = [
    # role: stylist | manager | sdl ; managers own a team, sdl owns everything
    {"id": "sdl1", "name": "Jordan Avery", "role": "sdl", "salon_id": "s1"},
    {"id": "m1", "name": "Priya Shah", "role": "manager", "salon_id": "s1"},
    {"id": "st1", "name": "Maya Patel", "role": "stylist", "salon_id": "s1", "manager_id": "m1"},
    # ... additional stylists across s1/s2/s3 (see frontend mockData for the full set)
]


def seed() -> None:
    """Insert demo data. TODO: implement once models + DB session exist."""
    raise NotImplementedError(
        "Seeding is not implemented yet. Add SQLAlchemy models + a session to "
        "backend/app/, then populate using DEMO_SALONS / DEMO_USERS above. "
        "See docs/AGENTS.md and frontend/src/lib/mockData.ts for the data shape."
    )


if __name__ == "__main__":
    print("PPH seed placeholder — see docstring. Nothing was written to the database.")
    print(f"Would seed {len(DEMO_SALONS)} salons and {len(DEMO_USERS)}+ users.")

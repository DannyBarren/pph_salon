"""Seed a production database with the super-admin + the real salon roster.

Run once on the production deploy (after `alembic upgrade head`), from the
`backend/` directory with `DATABASE_URL` set:

    python -m scripts.seed_production \
        --admin-username Venita_Admin \
        --admin-password 'Salon_Admin' \
        --csv "../PPH Data 06-26-2026.xlsx.csv"

What it does (idempotent — safe to re-run):

1. Imports every real salon + employee from the client export (creating them in
   a "pending setup" state: no password yet, so they can't log in until an
   admin/manager unlocks them and they set a password via the emailed link).
2. Creates (or updates) the super-admin account. The admin's *username* is stored
   in the login-identifier (email) field, so they sign in with the username +
   password and can change the password afterward.

Stylists/managers set their own passwords via the "unlock / send setup link"
flow — no plaintext passwords are seeded for them.
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from app.core import security
from app.db.session import engine
from app.models import Salon, User, UserRole
from app.services.importers import import_client_export
from app.services.weekly_repo import week_start_for
from sqlmodel import Session, SQLModel, select

from scripts.import_client_csv import _parse_file

DEFAULT_CSV = Path(__file__).resolve().parents[2] / "PPH Data 06-26-2026.xlsx.csv"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed production: admin + real roster.")
    parser.add_argument("--admin-username", default="Venita_Admin")
    parser.add_argument("--admin-password", default="Salon_Admin")
    parser.add_argument("--admin-name", default="Venita")
    parser.add_argument("--admin-role", default="owner", choices=["owner", "admin"])
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="Path to the client roster CSV/XLSX")
    parser.add_argument("--week-start", default=None, help="ISO Monday for the imported week")
    args = parser.parse_args()

    security.validate_password(args.admin_password)
    SQLModel.metadata.create_all(engine)

    ws = week_start_for(date.fromisoformat(args.week_start) if args.week_start else date.today())

    with Session(engine) as session:
        # 1) Real salons + employees (pending setup).
        rows = _parse_file(args.csv)
        result = import_client_export(session, rows, week_start=ws)
        print(
            f"Roster import: {result.salons_created} salons, {result.users_created} employees "
            f"created ({result.users_updated} updated), {result.skipped} skipped."
        )
        for err in result.errors[:10]:
            print(f"  ! {err}")

        # 2) Super-admin — attach to any existing salon (owner sees all salons).
        salon = session.exec(select(Salon).order_by(Salon.id)).first()
        if salon is None:
            salon = Salon(name="Administration")
            session.add(salon)
            session.commit()
            session.refresh(salon)

        admin = session.exec(select(User).where(User.email == args.admin_username)).first()
        hashed = security.hash_password(args.admin_password)
        if admin is None:
            admin = User(
                name=args.admin_name,
                email=args.admin_username,  # login identifier (username)
                role=UserRole(args.admin_role),
                salon_id=salon.id,
                hashed_password=hashed,
                is_active=True,
            )
            session.add(admin)
            verb = "Created"
        else:
            admin.name = args.admin_name
            admin.role = UserRole(args.admin_role)
            admin.hashed_password = hashed
            admin.is_active = True
            session.add(admin)
            verb = "Updated"
        session.commit()

    print(f"{verb} super-admin '{args.admin_username}' (role={args.admin_role}).")
    print("Sign in with that username + password, then change the password from Account.")


if __name__ == "__main__":
    main()

"""One-time bootstrap: create the first super-admin (owner) + optional salon.

Usage (from the backend/ directory, with DATABASE_URL set):

    python -m scripts.create_superadmin \
        --email owner@yoursalon.com \
        --name "Jordan Avery" \
        --password "a-strong-password" \
        --salon "Aria Studio"

If --password is omitted a strong temporary password is generated and printed.
The command is idempotent: re-running with the same email updates the password
and ensures the account is an active owner. This is the only account you need to
create by hand; everyone else is provisioned from the Admin panel (single form
or CSV bulk import).
"""

from __future__ import annotations

import argparse

from app.core import security
from app.db.session import engine
from app.models import Salon, User, UserRole
from sqlmodel import Session, SQLModel, select


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first super-admin user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--password", default=None)
    parser.add_argument("--salon", default="Main Salon", help="Salon name to attach the owner to")
    parser.add_argument(
        "--role",
        default="owner",
        choices=[r.value for r in UserRole],
        help="Super-admin role (owner or admin)",
    )
    args = parser.parse_args()

    # Ensure tables exist (harmless if migrations already ran).
    SQLModel.metadata.create_all(engine)

    password = args.password or security.generate_temp_password()
    security.validate_password(password)

    with Session(engine) as session:
        salon = session.exec(select(Salon).where(Salon.name == args.salon)).first()
        if salon is None:
            salon = Salon(name=args.salon)
            session.add(salon)
            session.commit()
            session.refresh(salon)
            print(f"Created salon '{salon.name}' (id={salon.id}).")

        user = session.exec(select(User).where(User.email == args.email)).first()
        if user is None:
            user = User(
                name=args.name,
                email=args.email,
                role=UserRole(args.role),
                salon_id=salon.id,
                hashed_password=security.hash_password(password),
                is_active=True,
            )
            session.add(user)
            action = "Created"
        else:
            user.name = args.name
            user.role = UserRole(args.role)
            user.salon_id = salon.id
            user.is_active = True
            user.hashed_password = security.hash_password(password)
            session.add(user)
            action = "Updated"
        session.commit()
        session.refresh(user)
        salon_id = salon.id

    print(f"{action} super-admin '{args.email}' (role={args.role}, salon_id={salon_id}).")
    if args.password is None:
        print(f"Temporary password: {password}")
        print("Sign in and change it immediately.")


if __name__ == "__main__":
    main()

"""Model + relationship tests against an in-memory SQLite database."""

from datetime import date

import pytest
from app.models import DailyPerformance, PayTier, Salon, User, UserRole, Week
from sqlmodel import Session, SQLModel, create_engine, select


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def test_salon_user_hierarchy_and_relationships(session: Session):
    salon = Salon(name="Aria Studio", city="Downtown", guarantee_rate=17.0)
    session.add(salon)
    session.commit()

    manager = User(name="Priya Shah", role=UserRole.manager, salon_id=salon.id)
    session.add(manager)
    session.commit()

    stylist = User(
        name="Maya Patel", role=UserRole.stylist, salon_id=salon.id, manager_id=manager.id
    )
    session.add(stylist)
    session.commit()

    session.refresh(salon)
    session.refresh(manager)
    session.refresh(stylist)

    # salon -> users
    assert {u.name for u in salon.users} == {"Priya Shah", "Maya Patel"}
    # self-referential manager / reports
    assert stylist.manager.id == manager.id
    assert [r.id for r in manager.reports] == [stylist.id]
    # timestamps auto-populated
    assert stylist.created_at is not None and stylist.updated_at is not None


def test_pay_tier_unique_per_salon(session: Session):
    salon = Salon(name="Lumière")
    session.add(salon)
    session.commit()
    session.add(PayTier(salon_id=salon.id, desired_rate=12, pph=30))
    session.commit()
    session.refresh(salon)
    assert salon.pay_tiers[0].pph == 30


def test_week_and_daily_performance_cascade(session: Session):
    salon = Salon(name="Maven")
    session.add(salon)
    session.commit()
    stylist = User(name="Grace", role=UserRole.stylist, salon_id=salon.id)
    session.add(stylist)
    session.commit()

    week = Week(stylist_id=stylist.id, week_start=date(2026, 6, 22), scheduled_total_hrs=27.25)
    week.daily_performances = [
        DailyPerformance(date=date(2026, 6, 23), scheduled_hrs=5.25, actual_production=612),
        DailyPerformance(date=date(2026, 6, 24), scheduled_hrs=6.25, actual_production=705),
    ]
    session.add(week)
    session.commit()
    session.refresh(week)

    assert len(week.daily_performances) == 2
    assert week.stylist.name == "Grace"
    assert stylist.weeks[0].id == week.id

    # delete-orphan cascade removes children with the parent week
    session.delete(week)
    session.commit()
    assert session.exec(select(DailyPerformance)).all() == []

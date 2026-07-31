"""Aggregate v1 API router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    goals,
    health,
    messages,
    payment_logic,
    payplan,
    performance,
    salons,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(salons.router)
api_router.include_router(payplan.router)
api_router.include_router(payment_logic.router)
api_router.include_router(performance.router)
api_router.include_router(admin.router)
api_router.include_router(messages.router)
api_router.include_router(goals.router)
api_router.include_router(goals.notif_router)

"""Aggregate v1 API router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import health, payplan

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(payplan.router)

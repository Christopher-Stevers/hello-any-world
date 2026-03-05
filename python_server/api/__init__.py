"""API routers package initializer."""
from __future__ import annotations

from fastapi import APIRouter

from .health import router as health_router

__all__ = ["api_router"]

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
from __future__ import annotations

from fastapi import APIRouter

from python_utils import get_env_bool

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "debug": get_env_bool("DEBUG")}
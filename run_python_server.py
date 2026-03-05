#!/usr/bin/env python3
"""Start the Python FastAPI server from repo root. Loads root .env and sets DATABASE_URL from PYTHON_DATABASE_URL (or DATABASE_URL_PYTHON)."""
from __future__ import annotations

import os
import runpy
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(dotenv_path=None, **kwargs):  # noqa: ARG001
        pass

_ROOT = Path(__file__).resolve().parent
load_dotenv(_ROOT / ".env")

# Prefer PYTHON_DATABASE_URL / DATABASE_URL_PYTHON so one env var drives the Python stack
_db_url = (
    os.environ.get("PYTHON_DATABASE_URL")
    or os.environ.get("DATABASE_URL_PYTHON")
    or os.environ.get("DATABASE_URL")
)
if _db_url and _db_url.startswith("postgresql://") and "+" not in _db_url.split("://")[0]:
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg://", 1)
if _db_url:
    os.environ["DATABASE_URL"] = _db_url

os.chdir(_ROOT / "python_server")
runpy.run_path("index.py", run_name="__main__")

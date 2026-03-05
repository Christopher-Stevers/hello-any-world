from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    _dir = Path(__file__).resolve().parent
    load_dotenv(_dir.parent / ".env")
    load_dotenv(_dir / ".env")
except ImportError:
    pass

# Set DATABASE_URL from PYTHON_DATABASE_URL / DATABASE_URL_PYTHON before python_db is imported
for _env in ("PYTHON_DATABASE_URL", "DATABASE_URL_PYTHON"):
    _u = os.environ.get(_env)
    if _u:
        if _u.startswith("postgresql://") and "+" not in _u.split("://")[0]:
            _u = _u.replace("postgresql://", "postgresql+psycopg://", 1)
        os.environ["DATABASE_URL"] = _u
        break

import uvicorn

from config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
    )


if __name__ == "__main__":
    main()
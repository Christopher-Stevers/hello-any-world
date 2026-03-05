from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI

from db.connection import engine
from python_db.python_db.database import check_connection

# Prefer the in-repo python_db (python_db/python_db) when run without pip install -e.



@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    print("Starting lifespan")
    check_connection()
    yield
    print("Ending lifespan")



app = FastAPI(title="Hello All Worlds - Python Server", lifespan=lifespan)

api_router = APIRouter()


@api_router.get("/health")
def health() -> dict:
    return {"status": "ok",  }


app.include_router(api_router)


@app.get("/")
def root() -> dict:
    return {"message": "Hello from python_server"}

from __future__ import annotations

import os

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    app_name: str = "Hello All Worlds - Python Server"
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False
    database_url: str | None = None


class Config(BaseModel):
    """Derived configuration used by the app."""

    app_name: str
    host: str
    port: int
    reload: bool
    database_url: str | None


def get_settings() -> AppSettings:
    return AppSettings()


def build_config() -> Config:
    settings = get_settings()
    db_url = (
        settings.database_url
        or os.environ.get("PYTHON_DATABASE_URL")
        or os.environ.get("DATABASE_URL_PYTHON")
    )
    return Config(
        app_name=settings.app_name,
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        database_url=db_url,
    )
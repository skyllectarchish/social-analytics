from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the backend/ directory (parent of app/)
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ClickHouse
    clickhouse_host: str
    clickhouse_port: int = 8443
    clickhouse_user: str
    clickhouse_password: str
    clickhouse_database: str = "social_analytics"

    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440

    # Meta / Instagram
    meta_app_id: str
    meta_app_secret: str
    meta_redirect_uri: str

    # App
    frontend_url: str = "http://localhost:5173"
    log_level: str = "INFO"


settings = Settings()

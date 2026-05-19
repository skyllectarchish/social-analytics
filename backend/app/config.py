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

    # OAuth state CSRF token (signed JWT, scoped to the IG connect flow)
    oauth_state_ttl_seconds: int = 600

    # App
    frontend_url: str = "http://localhost:5173"
    log_level: str = "INFO"

    # Tier 2 / F4 — Claude Haiku for sentiment + topic labelling. Optional:
    # only the batch jobs require this; the API itself starts without it.
    anthropic_api_key: str = ""

    # Tier 2 — APScheduler-driven batch jobs in the API process.
    # Set ENABLE_SCHEDULER=false to disable (e.g., when running cron externally
    # or in a multi-worker deploy where only one worker should schedule jobs).
    enable_scheduler: bool = True
    scheduler_competitor_sync_hour: int = 3   # UTC hour for the daily competitor snapshot
    scheduler_sentiment_batch_minutes: int = 60  # interval in minutes for sentiment batches
    scheduler_topic_clustering_day: int = 0   # weekday for topic clustering (0=Mon)
    scheduler_topic_clustering_hour: int = 4  # UTC hour for the weekly topic clustering run


settings = Settings()

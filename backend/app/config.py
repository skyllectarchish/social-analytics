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
    # only the Tier 2 batch jobs use this. The Tier 4 AI Copilot features
    # use Ollama Cloud (see ollama_* settings below).
    anthropic_api_key: str = ""

    # Tier 4 — AI Copilot via Ollama Cloud (https://ollama.com).
    # Routes return 503 when ollama_api_key is unset.
    ollama_api_key: str = ""
    ollama_host: str = "https://ollama.com"
    ollama_model: str = "gpt-oss:120b"      # used for all four AI features

    # Tier 4 — AI Copilot quota + behavior
    ai_monthly_call_limit: int = 100        # default per-user monthly cap
    ai_digest_streaming_enabled: bool = True
    ai_request_timeout_s: int = 120         # generous: gpt-oss:120b can take >60s for synthesis
    ai_circuit_breaker_threshold: int = 5   # consecutive 5xx failures before tripping
    ai_circuit_breaker_window_s: int = 60   # rolling window for the failure count
    ai_circuit_breaker_cooldown_s: int = 300  # how long to short-circuit after tripping
    ai_telemetry_max_events_per_request: int = 200

    # Tier 2 — APScheduler-driven batch jobs in the API process.
    # Set ENABLE_SCHEDULER=false to disable (e.g., when running cron externally
    # or in a multi-worker deploy where only one worker should schedule jobs).
    enable_scheduler: bool = True
    scheduler_competitor_sync_hour: int = 3   # UTC hour for the daily competitor snapshot
    scheduler_sentiment_batch_minutes: int = 60  # interval in minutes for sentiment batches
    scheduler_topic_clustering_day: int = 0   # weekday for topic clustering (0=Mon)
    scheduler_topic_clustering_hour: int = 4  # UTC hour for the weekly topic clustering run

    # Tier 4 — weekly digest scheduled job. Synthesizes digests for every
    # user with enough posting history every Monday, recording quota under
    # feature='digest_auto' (does NOT count against the user's monthly cap).
    scheduler_weekly_digest_day: int = 0      # 0 = Monday
    scheduler_weekly_digest_hour: int = 8     # UTC

    # Tier 4 — admin endpoints. Header-keyed (X-Admin-Key) — leave blank
    # to disable admin routes entirely.
    admin_api_key: str = ""


settings = Settings()

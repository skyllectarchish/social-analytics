from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the backend/ directory (parent of app/)
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

# Minimum JWT_SECRET_KEY length (bytes). HS256 is comfortable with 32+ bytes;
# we require 32 chars as a defensive floor. The .env.example placeholder is
# explicitly rejected so a fresh checkout can't accidentally ship with it.
_JWT_SECRET_MIN_LEN = 32
_JWT_SECRET_PLACEHOLDER = "CHANGE-ME-generate-with-secrets-token-urlsafe"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH),
        env_file_encoding="utf-8",
        # forbid catches .env typos (e.g. JWT_SECRET vs JWT_SECRET_KEY) at
        # startup instead of letting the missing-required error mask them.
        extra="forbid",
    )

    # ClickHouse
    clickhouse_host: str
    clickhouse_port: int = 8443
    # Native (secure) TCP port — only used by run_migrations.py via the
    # clickhouse-migrations library. Not consumed by Settings, but declared
    # here so extra="forbid" tolerates it being present in .env.
    clickhouse_native_port: int = 9440
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
    meta_system_token: str = ""
    meta_system_ig_user_id: str = ""

    # Google / YouTube
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""   # must match /auth/youtube/callback registered in Google Cloud Console

    # YouTube Phase 2 — Webhook Intelligence
    # Set to your public base URL (e.g. https://abc123.ngrok.io) to enable
    # PubSubHubbub subscriptions. Leave blank to use polling fallback.
    webhook_base_url: str = ""

    # Archive Miner
    archive_miner_max_videos_per_run: int = 20
    scheduler_archive_miner_day: int = 6   # 6 = Sunday
    scheduler_archive_miner_hour: int = 3  # UTC

    # Predictive projections
    default_rpm_usd: float = 3.0

    # Competitor limits
    competitor_limit_standard: int = 5
    competitor_limit_premium: int = 25

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
    scheduler_account_sync_hour: int = 2      # UTC hour for the daily own-account sync
    account_sync_lookback_days: int = 7       # insights window topped up by the daily sync
    token_refresh_threshold_days: int = 10    # refresh long-lived tokens expiring within N days
    scheduler_competitor_sync_hour: int = 3   # UTC hour for the daily competitor snapshot
    scheduler_sentiment_batch_minutes: int = 60  # interval in minutes for sentiment batches
    scheduler_topic_clustering_day: int = 0   # weekday for topic clustering (0=Mon)
    scheduler_topic_clustering_hour: int = 4  # UTC hour for the weekly topic clustering run

    # Story analytics retention — snapshot live stories + insights every N
    # hours (stories expire after 24h; 4h gives each story ~6 capture points,
    # so the last capture lands closer to expiry with the most complete
    # insights). The scheduler also runs one catch-up snapshot on startup.
    scheduler_story_snapshot_hours: int = 4

    # --- Instagram trending audio via the PRIVATE (unofficial) mobile API ---
    # WARNING: this is NOT the official Graph API. It logs in as a real IG
    # account through instagrapi and calls /api/v1/music/trending/. It VIOLATES
    # Meta's Terms of Service, risks the account being banned, and breaks when
    # Instagram changes internals. OFF by default. Use a throwaway account, and
    # set credentials only in .env (never in code). See app/instagram/trending_live.py.
    ig_trending_enabled: bool = False
    ig_trending_username: str = ""
    ig_trending_password: str = ""
    ig_trending_session_path: str = "ig_session.json"  # cached login to avoid re-auth

    # Comment-to-DM keyword funnels — runner cadence + guardrails.
    scheduler_dm_funnel_minutes: int = 15     # how often to scan for trigger comments
    dm_funnel_media_lookback_days: int = 7    # recent-post window scanned for triggers
    dm_funnel_max_sends_per_run: int = 25     # per-user DM cap per run (rate-limit safety)

    # Tier 4 — weekly digest scheduled job. Synthesizes digests for every
    # user with enough posting history every Monday, recording quota under
    # feature='digest_auto' (does NOT count against the user's monthly cap).
    scheduler_weekly_digest_day: int = 0      # 0 = Monday
    scheduler_weekly_digest_hour: int = 8     # UTC

    # Tier 4 — admin endpoints. Header-keyed (X-Admin-Key) — leave blank
    # to disable admin routes entirely.
    admin_api_key: str = ""

    @field_validator("jwt_secret_key")
    @classmethod
    def _validate_jwt_secret(cls, v: str) -> str:
        if v.startswith(_JWT_SECRET_PLACEHOLDER):
            raise ValueError(
                "JWT_SECRET_KEY is still the .env.example placeholder — "
                "generate one with: python -c \"import secrets; "
                "print(secrets.token_urlsafe(48))\""
            )
        if len(v) < _JWT_SECRET_MIN_LEN:
            raise ValueError(
                f"JWT_SECRET_KEY must be at least {_JWT_SECRET_MIN_LEN} "
                "characters (recommended: 64+)."
            )
        return v


settings = Settings()

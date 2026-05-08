from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    clickhouse_host: str
    clickhouse_port: int = 8443
    clickhouse_user: str
    clickhouse_password: str
    clickhouse_database: str = "social_analytics"

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440

    meta_app_id: str
    meta_app_secret: str
    meta_redirect_uri: str

    frontend_url: str = "http://localhost:5173"


settings = Settings()

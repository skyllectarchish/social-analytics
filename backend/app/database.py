import clickhouse_connect
from clickhouse_connect.driver.client import Client
from .config import settings

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = clickhouse_connect.get_client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            username=settings.clickhouse_user,
            password=settings.clickhouse_password,
            database=settings.clickhouse_database,
            secure=True,
        )
    return _client


def ping() -> bool:
    try:
        get_client().ping()
        return True
    except Exception:
        return False

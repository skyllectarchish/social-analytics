"""ClickHouse client management.

Provides get_client() as a FastAPI dependency and startup/shutdown
lifecycle hooks.

FastAPI runs sync route handlers in a threadpool. clickhouse-connect's
HTTP client is not thread-safe when sharing a single instance, so we
use thread-local storage to give each thread its own client.
"""

import logging
import threading

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from .config import settings

logger = logging.getLogger(__name__)

_local = threading.local()


def _create_client() -> Client:
    """Create a new ClickHouse client from settings."""
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
        secure=True,
    )


def get_client() -> Client:
    """Return a thread-local ClickHouse client, creating it on first call per thread."""
    if not hasattr(_local, "client"):
        logger.info("Creating ClickHouse client (thread %s)", threading.current_thread().name)
        _local.client = _create_client()
    return _local.client


def close_client() -> None:
    """Close the current thread's ClickHouse client. Called at app shutdown."""
    if hasattr(_local, "client"):
        logger.info("Closing ClickHouse client")
        _local.client.close()
        del _local.client


def ping() -> bool:
    """Return True if the ClickHouse server is reachable."""
    try:
        get_client().ping()
        return True
    except Exception:
        logger.exception("ClickHouse ping failed")
        return False

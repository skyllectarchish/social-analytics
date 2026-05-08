"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.router import router as auth_router
from .config import settings
from .database import close_client, ping
from .exception_handlers import register_exception_handlers
from .instagram.router import router as instagram_router
from .logging_config import setup_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — startup and shutdown hooks."""
    # --- Startup ---
    setup_logging(settings.log_level)
    logger.info("Starting Social Analytics API")
    if not ping():
        logger.error("ClickHouse connection failed on startup")
    else:
        logger.info("ClickHouse connection OK")
    yield
    # --- Shutdown ---
    close_client()
    logger.info("Social Analytics API shut down")


app = FastAPI(
    title="Social Analytics API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth_router)
app.include_router(instagram_router)


@app.get("/api/health")
def health():
    """Health check endpoint."""
    db_ok = ping()
    return {"status": "ok" if db_ok else "degraded", "database": db_ok}

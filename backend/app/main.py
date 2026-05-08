from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.router import router as auth_router
from .config import settings
from .database import ping
from .instagram.router import router as instagram_router

app = FastAPI(title="Social Analytics API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(instagram_router)


@app.get("/api/health")
def health():
    db_ok = ping()
    return {"status": "ok" if db_ok else "degraded", "database": db_ok}


@app.on_event("startup")
def startup():
    if not ping():
        import logging
        logging.warning("ClickHouse connection failed on startup")

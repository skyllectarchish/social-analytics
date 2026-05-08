"""FastAPI exception handlers — map domain exceptions to HTTP responses."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .exceptions import (
    AccountDisabledError,
    AppError,
    AuthenticationError,
    DatabaseError,
    DuplicateEntityError,
    EntityNotFoundError,
    InstagramAPIError,
    InstagramNotConnectedError,
    OAuthError,
)

logger = logging.getLogger(__name__)

# Map exception types to HTTP status codes
_STATUS_MAP: dict[type[AppError], int] = {
    AuthenticationError: 401,
    AccountDisabledError: 403,
    DuplicateEntityError: 409,
    EntityNotFoundError: 404,
    InstagramNotConnectedError: 404,
    OAuthError: 400,
    InstagramAPIError: 502,
    DatabaseError: 503,
}


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on the FastAPI app."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        status_code = _STATUS_MAP.get(type(exc), 500)

        if status_code >= 500:
            logger.exception("Unhandled application error: %s", exc.message)
            detail = "An internal error occurred"
        else:
            logger.warning("Client error [%d]: %s", status_code, exc.message)
            detail = exc.message

        return JSONResponse(
            status_code=status_code,
            content={"detail": detail},
        )

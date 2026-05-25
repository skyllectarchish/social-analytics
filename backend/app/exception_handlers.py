"""FastAPI exception handlers — map domain exceptions to HTTP responses."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .exceptions import (
    AccountDisabledError,
    AICircuitOpenError,
    AIError,
    AINotConfiguredError,
    AIProviderError,
    AppError,
    AuthenticationError,
    DatabaseError,
    DuplicateEntityError,
    EntityNotFoundError,
    InstagramAPIError,
    InstagramNotConnectedError,
    InstagramSetupError,
    MediaNotEligibleError,
    OAuthError,
    QuotaExhaustedError,
)

logger = logging.getLogger(__name__)

# Map exception types to HTTP status codes. AI exceptions map to status
# codes the frontend's error taxonomy (see frontend plan §26) already
# branches on — 429 for quota, 422 for not-eligible, 502 for upstream.
_STATUS_MAP: dict[type[AppError], int] = {
    AuthenticationError: 401,
    AccountDisabledError: 403,
    DuplicateEntityError: 409,
    EntityNotFoundError: 404,
    InstagramNotConnectedError: 404,
    OAuthError: 400,
    InstagramSetupError: 400,
    InstagramAPIError: 502,
    DatabaseError: 503,
    AINotConfiguredError: 503,
    QuotaExhaustedError: 429,
    MediaNotEligibleError: 422,
    AIProviderError: 502,
    AICircuitOpenError: 502,
}


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on the FastAPI app."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        status_code = _STATUS_MAP.get(type(exc), 500)

        if status_code >= 500:
            logger.error(
                "Unhandled application error: %s", exc.message, exc_info=exc,
            )
            message = "An internal error occurred"
        else:
            logger.warning("Client error [%d]: %s", status_code, exc.message)
            message = exc.message

        # AI errors carry a stable `code` the frontend's error taxonomy
        # branches on. Surface it in the response so the FE can show the
        # right copy without parsing the message.
        if isinstance(exc, AIError):
            content = {"detail": {"message": message, "code": exc.code}}
        else:
            content = {"detail": message}

        return JSONResponse(status_code=status_code, content=content)

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        # Catch-all so unexpected bugs (KeyError, IndexError, httpx.* leaking
        # out of routes, etc.) produce a structured 500 instead of FastAPI's
        # default HTML error page.
        logger.error(
            "Unhandled exception on %s %s",
            request.method, request.url.path, exc_info=exc,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal error occurred"},
        )

"""Logging configuration — call setup_logging() once at app startup."""

import logging
import re
import sys


# Redact common credential shapes from log lines so a stray
# logger.error("...", exc.response.text) doesn't dump a Meta access token or
# an Authorization header into the log file.
_REDACTORS: tuple[tuple[re.Pattern, str], ...] = (
    # OAuth/Meta tokens carried in URLs or JSON bodies
    (re.compile(r'(access_token["\']?\s*[:=]\s*["\']?)[A-Za-z0-9._\-]{16,}', re.IGNORECASE), r"\1<redacted>"),
    (re.compile(r"(access_token=)[A-Za-z0-9._\-]{16,}", re.IGNORECASE), r"\1<redacted>"),
    # Bearer tokens in Authorization headers
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]{16,}"), r"\1<redacted>"),
    # OAuth client secrets if they ever end up in logs
    (re.compile(r'(client_secret["\']?\s*[:=]\s*["\']?)[A-Za-z0-9._\-]{8,}', re.IGNORECASE), r"\1<redacted>"),
    # Single-use auth codes — they're short-lived but still credentials
    (re.compile(r"([?&]code=)[A-Za-z0-9._\-]{8,}"), r"\1<redacted>"),
)


class _RedactSecretsFilter(logging.Filter):
    """Scrub credential-shaped substrings from every log record's message."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        for pattern, replacement in _REDACTORS:
            msg = pattern.sub(replacement, msg)
        record.msg = msg
        record.args = ()
        return True


def setup_logging(level: str = "INFO") -> None:
    """Configure structured logging for the application."""
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
    )

    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format=log_format,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )

    redact = _RedactSecretsFilter()
    for handler in logging.getLogger().handlers:
        handler.addFilter(redact)

    # Suppress noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("clickhouse_connect").setLevel(logging.WARNING)
    logging.getLogger("passlib").setLevel(logging.WARNING)

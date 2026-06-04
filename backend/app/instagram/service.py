"""Instagram Login API client — async HTTP operations only.

All database operations are handled by app.repositories.instagram_repo.
This module is responsible only for Instagram API communication.
"""

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt

from ..config import settings
from ..constants import (
    ACCOUNT_DEMOGRAPHIC_METRICS,
    ACCOUNT_TIME_SERIES_METRICS,
    DEFAULT_MEDIA_FETCH_LIMIT,
    GRAPH_BASE_URL,
    HTTP_TIMEOUT_SECONDS,
    INSIGHTS_API_WINDOW_DAYS,
    INSTAGRAM_MEDIA_FIELDS,
    INSTAGRAM_PROFILE_FIELDS,
    MEDIA_FEED_METRICS,
    MEDIA_REELS_METRICS,
    MEDIA_STORY_METRICS,
    OAUTH_DIALOG_URL,
    REQUIRED_INSTAGRAM_SCOPES,
    STORY_FIELDS,
    TOKEN_EXCHANGE_URL,
)
from ..exceptions import InstagramAPIError, OAuthError

logger = logging.getLogger(__name__)


def create_signed_oauth_state(user_id: str) -> str:
    """Mint a signed, short-lived state token bound to the logged-in user.

    The state is a JWT signed with the app's JWT secret. It carries the user id,
    a nonce, an expiry, and a purpose tag — verified on `/callback` to prevent
    CSRF and cross-user code injection.
    """
    payload = {
        "uid": user_id,
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(tz=timezone.utc)
        + timedelta(seconds=settings.oauth_state_ttl_seconds),
        "purpose": "ig_oauth_state",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_oauth_state(state: str, expected_user_id: str) -> None:
    """Verify a state token on /callback. Raises OAuthError on any failure."""
    try:
        payload = jwt.decode(
            state, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        raise OAuthError("Invalid or expired OAuth state token")
    if payload.get("purpose") != "ig_oauth_state" or payload.get("uid") != expected_user_id:
        raise OAuthError("OAuth state user mismatch")


def get_oauth_url(state: str) -> str:
    """Construct the Instagram Login OAuth dialog URL.

    Args:
        state: signed JWT state (mandatory). Verified on callback.
    """
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": ",".join(REQUIRED_INSTAGRAM_SCOPES),
        "response_type": "code",
        "state": state,
    }
    return f"{OAUTH_DIALOG_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> tuple[str, str]:
    """Exchange an OAuth authorization code for a short-lived token + IG user ID.

    The Instagram Login API returns the IG Business user ID directly in the
    token-exchange response, so we no longer need a separate /me/accounts walk.

    Returns:
        Tuple of (short_lived_token, ig_user_id).

    Raises:
        OAuthError: If the token exchange fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(
                TOKEN_EXCHANGE_URL,
                data={
                    "client_id": settings.meta_app_id,
                    "client_secret": settings.meta_app_secret,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.meta_redirect_uri,
                    "code": code,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            # Meta has historically returned user_id as int OR string — normalize.
            return body["access_token"], str(body["user_id"])
        except httpx.HTTPStatusError as exc:
            logger.error("Token exchange failed: %s", exc.response.text)
            raise OAuthError("Failed to exchange authorization code for token")
        except (KeyError, httpx.HTTPError) as exc:
            logger.error("Token exchange error: %s", exc)
            raise OAuthError("Invalid response from Instagram token endpoint")


async def get_long_lived_token(short_token: str) -> tuple[str, int]:
    """Exchange a short-lived token for a long-lived token (~60 days).

    Uses the IG Login `ig_exchange_token` grant on `graph.instagram.com`.

    Returns:
        Tuple of (long_lived_token, expires_in_seconds).

    Raises:
        OAuthError: If the exchange fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/access_token",
                params={
                    "grant_type": "ig_exchange_token",
                    "client_secret": settings.meta_app_secret,
                    "access_token": short_token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["access_token"], data.get("expires_in", 5184000)
        except httpx.HTTPStatusError as exc:
            logger.error("Long-lived token exchange failed: %s", exc.response.text)
            raise OAuthError("Failed to exchange for long-lived token")
        except (KeyError, httpx.HTTPError) as exc:
            logger.error("Long-lived token error: %s", exc)
            raise OAuthError("Invalid response from Instagram token endpoint")


async def refresh_long_lived_token(token: str) -> tuple[str, int]:
    """Refresh an unexpired long-lived token for another ~60 days.

    Uses the IG Login `ig_refresh_token` grant on `graph.instagram.com`.
    Meta requires the token to be at least 24 hours old and still valid —
    an already-expired token cannot be refreshed (the user must re-OAuth).

    Returns:
        Tuple of (refreshed_token, expires_in_seconds).

    Raises:
        OAuthError: If the refresh fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/refresh_access_token",
                params={"grant_type": "ig_refresh_token", "access_token": token},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["access_token"], data.get("expires_in", 5184000)
        except httpx.HTTPStatusError as exc:
            logger.error("Token refresh failed: %s", exc.response.text)
            raise OAuthError("Failed to refresh long-lived token")
        except (KeyError, httpx.HTTPError) as exc:
            logger.error("Token refresh error: %s", exc)
            raise OAuthError("Invalid response from Instagram token endpoint")


# Meta error codes that the platform documents as transient. Worth retrying.
# 1 = UNKNOWN, 2 = SERVICE temporarily unavailable, 4 = APPLICATION_USER rate
# limit, 17 = USER rate limit, 32 = PAGE rate limit. See:
# https://developers.facebook.com/docs/graph-api/guides/error-handling/
_TRANSIENT_META_ERROR_CODES: frozenset[int] = frozenset({1, 2, 4, 17, 32})


def _is_transient_meta_error(exc: httpx.HTTPError) -> bool:
    """Return True when `exc` looks like a transient Graph API failure.

    Covers three categories:
    1. Network/timeout failures (no response object at all).
    2. HTTP 5xx and 429 responses.
    3. 4xx responses whose JSON body carries `error.is_transient: true` or one
       of Meta's documented transient `error.code` values.

    Non-transient failures (400 with auth error, 403 forbidden, schema-shape
    errors) return False — those should bubble up to the user as real bugs.
    """
    resp = getattr(exc, "response", None)
    if resp is None:
        return True  # connection error / timeout

    status = resp.status_code
    if 500 <= status < 600 or status == 429:
        return True

    # Meta sometimes returns 400 with is_transient=true (e.g., temporary
    # backend hiccup that surfaced through validation). Inspect the body.
    try:
        body = resp.json().get("error", {}) or {}
    except (ValueError, AttributeError):
        return False
    if body.get("is_transient") is True:
        return True
    code = body.get("code")
    if isinstance(code, int) and code in _TRANSIENT_META_ERROR_CODES:
        return True
    return False


def _short_http_error(exc: httpx.HTTPError) -> str:
    """One-line summary of an HTTP error for log lines."""
    resp = getattr(exc, "response", None)
    if resp is None:
        return type(exc).__name__
    body_snippet = ""
    try:
        err = resp.json().get("error", {}) or {}
        msg = err.get("message") or err.get("type") or ""
        code = err.get("code")
        body_snippet = f" — {msg}" + (f" (code {code})" if code else "")
    except (ValueError, AttributeError):
        pass
    return f"HTTP {resp.status_code}{body_snippet}"


async def _retry_get_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, Any],
    label: str,
    max_retries: int = 3,
) -> dict[str, Any] | None:
    """GET `url` with exponential backoff on transient Graph API errors.

    Returns the parsed JSON body on success, or None when all retries are
    exhausted (so the caller can decide between partial-success and failure).

    Raises `InstagramAPIError` for non-transient errors — auth failures,
    malformed requests, etc. — because retrying those would just waste time.

    Backoff schedule: 1s, 2s, 4s. Honors `Retry-After` on 429 if Meta sends it.
    """
    last_exc: httpx.HTTPError | None = None
    for attempt in range(max_retries):
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            last_exc = exc
            if not _is_transient_meta_error(exc):
                resp = getattr(exc, "response", None)
                body_text = (resp.text[:500] if resp is not None else "")
                logger.error(
                    "Non-transient %s failure: %s — %s", label, exc, body_text,
                )
                raise InstagramAPIError(f"Failed to fetch Instagram {label}")
            if attempt < max_retries - 1:
                # Use Meta's Retry-After when available (only set on 429s).
                resp = getattr(exc, "response", None)
                delay = (
                    int(resp.headers.get("Retry-After", 2 ** attempt))
                    if resp is not None and resp.headers.get("Retry-After")
                    else 2 ** attempt
                )
                logger.warning(
                    "Transient %s error (attempt %d/%d, retry in %ds): %s",
                    label, attempt + 1, max_retries, delay,
                    _short_http_error(exc),
                )
                await asyncio.sleep(delay)
    logger.error(
        "Exhausted %d retries on %s: %s", max_retries, label,
        _short_http_error(last_exc) if last_exc else "unknown",
    )
    return None


async def fetch_profile(ig_user_id: str, token: str) -> dict[str, Any]:
    """Fetch the Instagram user's profile data, with transient-error retry.

    Raises:
        InstagramAPIError: On non-transient errors or after retries are exhausted.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        payload = await _retry_get_json(
            client,
            f"{GRAPH_BASE_URL}/{ig_user_id}",
            {"fields": INSTAGRAM_PROFILE_FIELDS, "access_token": token},
            label="profile",
        )
    if payload is None:
        raise InstagramAPIError(
            "Instagram is temporarily unavailable — please try again in a moment.",
        )
    return payload


async def fetch_media(
    ig_user_id: str,
    token: str,
    limit: int = DEFAULT_MEDIA_FETCH_LIMIT,
    max_pages: int | None = None,
) -> list[dict[str, Any]]:
    """Fetch media items for an Instagram user (handles pagination).

    Each page is fetched with transient-error retry. If retries on a page are
    exhausted mid-pagination, returns the items already collected rather than
    failing the entire refresh — the user gets partial data and a warning log
    rather than a 502. A non-transient error (auth failure, malformed query)
    still raises `InstagramAPIError`.

    Args:
        max_pages: cap on pages fetched. None = everything (full sync);
            the live-mode endpoints pass 1 to grab just the newest posts
            in a single Graph call.
    """
    media_items: list[dict[str, Any]] = []
    url = f"{GRAPH_BASE_URL}/{ig_user_id}/media"
    params: dict[str, Any] = {
        "fields": INSTAGRAM_MEDIA_FIELDS,
        "access_token": token,
        "limit": limit,
    }

    # Hard cap on pagination iterations — defensive against a malformed Meta
    # response that returns both `paging.next` and a stable `after` cursor
    # forever. At MAX_PAGES * limit items, no realistic account is unfetched.
    MAX_PAGES = max_pages if max_pages is not None else 200
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        page = 0
        seen_cursors: set[str] = set()
        while page < MAX_PAGES:
            page += 1
            logger.info("Fetching media page %d for %s", page, ig_user_id)
            data = await _retry_get_json(client, url, params, label="media page")
            if data is None:
                # Transient retries exhausted — surface partial success instead
                # of a 502 so /refresh stays usable during Meta hiccups.
                logger.warning(
                    "Media sync incomplete for %s: returning %d partial items "
                    "after transient errors on page %d",
                    ig_user_id, len(media_items), page,
                )
                return media_items

            media_items.extend(data.get("data", []))

            # Pagination: use the `after` cursor to stay on GRAPH_BASE_URL (v21.0)
            # Meta's raw `next` URL often forces v25.0 which can trigger #200 errors.
            paging = data.get("paging", {})
            after_cursor = paging.get("cursors", {}).get("after")
            if not paging.get("next") or not after_cursor:
                break
            # Guard against cursor cycles (Meta has historically returned the
            # same cursor twice during outages — without this, fetch_media
            # would loop until MAX_PAGES, wasting quota).
            if after_cursor in seen_cursors:
                logger.warning(
                    "Media pagination cursor repeated for %s — stopping at page %d",
                    ig_user_id, page,
                )
                break
            seen_cursors.add(after_cursor)
            params["after"] = after_cursor
        else:
            if max_pages is None:
                # Only alarming when we *intended* a full fetch — live mode
                # passes max_pages=1 and stopping early is the whole point.
                logger.warning(
                    "Media pagination hit MAX_PAGES=%d for %s — returning %d items",
                    MAX_PAGES, ig_user_id, len(media_items),
                )

    logger.info("Fetched %d media items for ig_user %s", len(media_items), ig_user_id)
    return media_items


async def fetch_fresh_media_urls(ig_media_id: str, ig_user_id: str, token: str) -> dict[str, str]:
    """Fetch fresh media_url and thumbnail_url for a single media item.
    The new Instagram API does not support GET /{media_id} directly, so we
    paginate through the user's recent media to find the fresh URL.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        url = f"{GRAPH_BASE_URL}/{ig_user_id}/media"
        params = {
            "fields": "id,media_url,thumbnail_url",
            "access_token": token,
            "limit": 50,
        }
        for _ in range(5):  # limit search depth
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                
                for item in data.get("data", []):
                    if item.get("id") == ig_media_id:
                        return {
                            "media_url": item.get("media_url", ""),
                            "thumbnail_url": item.get("thumbnail_url", ""),
                        }
                        
                after = data.get("paging", {}).get("cursors", {}).get("after")
                if not after:
                    break
                params["after"] = after
                
            except httpx.HTTPError as exc:
                logger.error("Failed to fetch fresh URLs for %s: %s", ig_media_id, exc)
                break
                
    raise InstagramAPIError(f"Media {ig_media_id} not found in recent feed to refresh URL")


async def _fetch_reach_follower_breakdown(
    http: httpx.AsyncClient,
    media_id: str,
    token: str,
) -> list[dict[str, Any]]:
    """Fetch the reach metric broken down by follower_type for one media.

    Returns a list shaped like Meta's per-media `data` entries so callers can
    splat the result alongside the main batch response. The synthetic metric
    names are `follower_reach` and `non_follower_reach` — these are what
    Tier 2 / F5 (Growth Drivers) and any downstream pivots key off.

    Returns an empty list on any failure (4xx, 5xx, parse error). The
    aggregate `reach` is already covered by the main batch fetch, so a
    missing breakdown only degrades F5 accuracy — never breaks Tier 1.
    """
    try:
        resp = await http.get(
            f"{GRAPH_BASE_URL}/{media_id}/insights",
            params={
                "metric": "reach",
                "breakdown": "follower_type",
                "access_token": token,
            },
        )
    except httpx.HTTPError as exc:
        logger.warning("reach breakdown HTTP error for %s: %s", media_id, exc)
        return []
    if resp.status_code != 200:
        # 400 here is common — Meta returns 400 on STORY media because the
        # breakdown isn't supported there. Don't escalate as an error.
        logger.debug(
            "reach breakdown skipped for %s (HTTP %d)", media_id, resp.status_code,
        )
        return []

    try:
        payload = resp.json()
    except ValueError:
        return []

    follower_value = 0
    non_follower_value = 0
    got_any = False
    for entry in payload.get("data", []) or []:
        if entry.get("name") != "reach":
            continue
        # Meta puts the breakdown under either `total_value.breakdowns` (newer
        # metric_type=total_value path) or `values[0]` for some legacy
        # responses. Try both to stay forward-compatible.
        breakdowns = (entry.get("total_value") or {}).get("breakdowns") or []
        if not breakdowns:
            for v in entry.get("values") or []:
                bds = v.get("breakdowns") or []
                if bds:
                    breakdowns = bds
                    break
        for bd in breakdowns:
            for res in bd.get("results") or []:
                dim_values = res.get("dimension_values") or []
                if not dim_values:
                    continue
                got_any = True
                value = int(res.get("value", 0) or 0)
                if dim_values[-1] == "FOLLOWER":
                    follower_value += value
                elif dim_values[-1] == "NON_FOLLOWER":
                    non_follower_value += value

    if not got_any:
        return []

    return [
        {"name": "follower_reach", "values": [{"value": follower_value}]},
        {"name": "non_follower_reach", "values": [{"value": non_follower_value}]},
    ]


async def fetch_media_insights_batch(
    media_items: list[tuple[str, str]],
    token: str,
    max_retries: int = 3,
    fetch_reach_breakdown: bool = True,
) -> dict[str, list[dict[str, Any]]]:
    """Fetch insights for multiple media items with rate-limit handling.

    Args:
        media_items: List of (ig_media_id, media_product_type) tuples.
        fetch_reach_breakdown: When True (default) and the media isn't a
            story, also fetches reach by follower_type and appends synthetic
            `follower_reach` / `non_follower_reach` metric entries. Tier 2
            F5 attribution uses these.

    Returns:
        {ig_media_id: [insight_data, ...]}
    """
    results: dict[str, list[dict[str, Any]]] = {}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        for media_id, media_product_type in media_items:
            if media_product_type == "REELS":
                metrics = MEDIA_REELS_METRICS
            elif media_product_type == "STORY":
                metrics = MEDIA_STORY_METRICS
            else:
                metrics = MEDIA_FEED_METRICS

            for attempt in range(max_retries):
                try:
                    resp = await client.get(
                        f"{GRAPH_BASE_URL}/{media_id}/insights",
                        params={"metric": metrics, "access_token": token},
                    )
                    resp.raise_for_status()
                    results[media_id] = resp.json().get("data", [])
                    await asyncio.sleep(0.5)
                    break
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 429:
                        retry_after = int(exc.response.headers.get("Retry-After", 60))
                        logger.warning(
                            "Rate limited on %s (attempt %d). Sleeping %ds...",
                            media_id, attempt + 1, retry_after,
                        )
                        await asyncio.sleep(retry_after)
                    elif exc.response.status_code == 400 and metrics != MEDIA_FEED_METRICS:
                        logger.warning(
                            "400 for %s with metrics %r, retrying with feed metrics",
                            media_id, metrics,
                        )
                        metrics = MEDIA_FEED_METRICS
                    else:
                        logger.error(
                            "Failed insights for %s (HTTP %d): %s",
                            media_id, exc.response.status_code, exc.response.text,
                        )
                        break
                except httpx.HTTPError as exc:
                    logger.error("Failed insights for %s: %s", media_id, exc)
                    break

            # Tier 2 / F5: follow-up reach-by-follower_type call. Skipped for
            # stories because the breakdown isn't supported on STORY media.
            if (
                fetch_reach_breakdown
                and media_id in results
                and media_product_type != "STORY"
            ):
                breakdown_entries = await _fetch_reach_follower_breakdown(
                    client, media_id, token,
                )
                if breakdown_entries:
                    results[media_id].extend(breakdown_entries)
                await asyncio.sleep(0.2)

    logger.info("Batch fetched insights for %d/%d media items", len(results), len(media_items))
    return results


async def fetch_active_stories(ig_user_id: str, token: str) -> list[dict[str, Any]]:
    """Fetch currently active stories for an Instagram user (live, expires after 24h).

    Raises:
        InstagramAPIError: If the API call fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}/stories",
                params={"fields": STORY_FIELDS, "access_token": token},
            )
            resp.raise_for_status()
            return resp.json().get("data", [])
        except httpx.HTTPStatusError as exc:
            logger.error("Failed to fetch stories: %s", exc.response.text)
            raise InstagramAPIError("Failed to fetch active stories")
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch stories: %s", exc)
            raise InstagramAPIError("Failed to fetch active stories")


def _iter_windows(since: int, until: int, window_days: int) -> list[tuple[int, int]]:
    """Split [since, until] (unix seconds) into ≤ window_days chunks.

    Meta caps account-insights since/until at ~30 days per request, so callers
    requesting longer ranges (e.g. 90- or 365-day backfills) must chunk.
    """
    window_secs = window_days * 86400
    windows: list[tuple[int, int]] = []
    cursor = since
    while cursor < until:
        end = min(cursor + window_secs, until)
        windows.append((cursor, end))
        cursor = end
    return windows


async def fetch_image(url: str) -> tuple[bytes, str]:
    """Fetch raw image bytes for a stored Instagram CDN URL.

    Used by the media-image proxy so the browser loads thumbnails from our own
    origin instead of hitting *.cdninstagram.com directly — that sidesteps
    content/tracker blockers (which treat the Facebook CDN as a tracker) and
    cross-origin/referrer rules that leave the bare <img> blank.

    Returns (content_bytes, content_type). Raises InstagramAPIError on failure.

    The CDN occasionally returns a transient 403/429 on a still-valid signed URL
    when it throttles a burst of requests from one IP, so we retry a couple of
    times with a short backoff before giving up.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
        for attempt in range(3):
            try:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.content, resp.headers.get("content-type", "image/jpeg")
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                # Only transient statuses are worth retrying; a genuine 404/410
                # (deleted media / dead signature) won't fix itself.
                if exc.response.status_code not in (403, 429, 500, 502, 503):
                    break
                await asyncio.sleep(0.5 * (attempt + 1))
            except httpx.HTTPError as exc:
                last_exc = exc
                await asyncio.sleep(0.5 * (attempt + 1))
    raise InstagramAPIError(f"Failed to fetch media image: {last_exc}") from last_exc


async def fetch_account_insights(
    ig_user_id: str,
    token: str,
    since: int,
    until: int,
) -> list[dict[str, Any]]:
    """Fetch account insights as a unified time-series list.

    Chunks the window into INSIGHTS_API_WINDOW_DAYS-sized requests so the same
    code path supports both the default 30-day sync and the 90-day initial
    backfill / 365-day historical pulls.

    Returns: [{name, values: [{value, end_time}]}]
    """
    windows = _iter_windows(since, until, INSIGHTS_API_WINDOW_DAYS)
    # Accumulate per-metric values across all windows, keyed by metric name.
    merged: dict[str, list[dict[str, Any]]] = {}
    time_series_attempts = 0
    time_series_successes = 0

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        # Call 1: time-series metrics (reach). Chunked because Meta caps per-request.
        # Windows older than Meta's ~90-day retention will return errors or empty data —
        # tolerate those and keep iterating so we still capture whatever Meta has.
        for w_since, w_until in windows:
            time_series_attempts += 1
            try:
                resp = await client.get(
                    f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
                    params={
                        "metric": ACCOUNT_TIME_SERIES_METRICS,
                        "period": "day",
                        "metric_type": "time_series",
                        "since": w_since,
                        "until": w_until,
                        "access_token": token,
                    },
                )
                resp.raise_for_status()
                for entry in resp.json().get("data", []):
                    merged.setdefault(entry.get("name", ""), []).extend(
                        entry.get("values", [])
                    )
                time_series_successes += 1
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "Time_series window %s-%s skipped (HTTP %d): %s",
                    w_since, w_until, exc.response.status_code, exc.response.text[:300],
                )
            except httpx.HTTPError as exc:
                logger.warning(
                    "Time_series window %s-%s skipped: %s", w_since, w_until, exc,
                )

        logger.info(
            "Account insights time_series: %d/%d windows succeeded",
            time_series_successes, time_series_attempts,
        )

        # Call 2: per-day total_value metrics via concurrent single GETs.
        #
        # We previously batched these via Meta's batch endpoint, but graph.instagram.com
        # returns HTTP 400 for /?batch=... (verified via diag_meta.py) — that endpoint
        # is Facebook-Graph-only and can't be used with IG Login tokens. Falling back to
        # one GET per day with a small semaphore for concurrency.
        #
        # `follows_and_unfollows` needs `breakdown=follow_type` to populate total_value
        # (without it, Meta returns the metric entry with NO total_value field at all,
        # which silently became 0 in the old code). Fetched in a separate call to keep
        # the breakdown from affecting the other metrics.
        since_dt = datetime.fromtimestamp(since, tz=timezone.utc)
        until_dt = datetime.fromtimestamp(until, tz=timezone.utc)
        day_windows: list[tuple[int, int, datetime]] = []
        cur = since_dt
        while cur < until_dt:
            nxt = min(cur + timedelta(days=1), until_dt)
            day_windows.append((int(cur.timestamp()), int(nxt.timestamp()), nxt))
            cur = nxt

        # Cap concurrency at 3 — Meta's per-user rate limit is tight on the
        # insights endpoints. Going wider trips 429s under load.
        sem = asyncio.Semaphore(3)
        flat_metrics = "views,total_interactions,accounts_engaged,saves,shares"
        auth_fail_count = 0  # tracks 401/403 across both batches

        async def fetch_flat(d_since: int, d_until: int) -> list[dict[str, Any]]:
            nonlocal auth_fail_count
            async with sem:
                try:
                    r = await client.get(
                        f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
                        params={
                            "metric": flat_metrics,
                            "period": "day",
                            "metric_type": "total_value",
                            "since": d_since,
                            "until": d_until,
                            "access_token": token,
                        },
                    )
                    if r.status_code in (401, 403):
                        auth_fail_count += 1
                        return []
                    if r.status_code != 200:
                        return []
                    return r.json().get("data", [])
                except httpx.HTTPError:
                    return []

        async def fetch_follow(d_since: int, d_until: int) -> list[dict[str, Any]]:
            nonlocal auth_fail_count
            async with sem:
                try:
                    r = await client.get(
                        f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
                        params={
                            "metric": "follows_and_unfollows",
                            "period": "day",
                            "metric_type": "total_value",
                            "breakdown": "follow_type",
                            "since": d_since,
                            "until": d_until,
                            "access_token": token,
                        },
                    )
                    if r.status_code in (401, 403):
                        auth_fail_count += 1
                        return []
                    if r.status_code != 200:
                        return []
                    return r.json().get("data", [])
                except httpx.HTTPError:
                    return []

        flat_results, follow_results = await asyncio.gather(
            asyncio.gather(*[fetch_flat(s, u) for s, u, _ in day_windows]),
            asyncio.gather(*[fetch_follow(s, u) for s, u, _ in day_windows]),
        )

        # If every single sub-request hit 401/403, the token is dead and the
        # user needs to reconnect. Raise so the route surfaces a real error
        # instead of silently storing empty insights.
        total_attempts = 2 * len(day_windows)
        if total_attempts and auth_fail_count == total_attempts:
            raise OAuthError(
                "Instagram token rejected by Meta — please reconnect your account.",
            )

        # Normalise day_end to midnight UTC of its calendar date so two syncs
        # that run at different clock times produce identical `end_time` values
        # — otherwise account_insights (deduped on
        # (user_id, ig_user_id, metric_name, end_time)) accumulates one row per
        # sync run instead of one row per calendar day.
        def _day_end_iso(day_end: datetime) -> str:
            midnight = datetime.combine(
                day_end.date(), datetime.min.time(), tzinfo=timezone.utc,
            )
            return midnight.strftime("%Y-%m-%dT%H:%M:%S+0000")

        flat_success = 0
        follow_success = 0
        for (_, _, day_end), entries in zip(day_windows, flat_results):
            if not entries:
                continue
            flat_success += 1
            end_time_iso = _day_end_iso(day_end)
            for entry in entries:
                name = entry.get("name", "")
                value = entry.get("total_value", {}).get("value")
                if not name or value is None:
                    continue
                merged.setdefault(name, []).append(
                    {"value": int(value), "end_time": end_time_iso}
                )

        for (_, _, day_end), entries in zip(day_windows, follow_results):
            if not entries:
                continue
            end_time_iso = _day_end_iso(day_end)
            for entry in entries:
                if entry.get("name") != "follows_and_unfollows":
                    continue
                # Net change = FOLLOWER (new follows) - NON_FOLLOWER (unfollows).
                net = 0
                got_any = False
                for bd in entry.get("total_value", {}).get("breakdowns", []) or []:
                    for res in bd.get("results", []) or []:
                        dim = res.get("dimension_values", []) or []
                        v = int(res.get("value", 0) or 0)
                        if not dim:
                            continue
                        got_any = True
                        if dim[-1] == "FOLLOWER":
                            net += v
                        elif dim[-1] == "NON_FOLLOWER":
                            net -= v
                if got_any:
                    follow_success += 1
                    merged.setdefault("follows_and_unfollows", []).append(
                        {"value": net, "end_time": end_time_iso}
                    )

        logger.info(
            "Account insights per-day: flat=%d/%d follow=%d/%d days populated",
            flat_success, len(day_windows), follow_success, len(day_windows),
        )

        return [{"name": name, "values": values} for name, values in merged.items()]


async def fetch_demographics(
    ig_user_id: str,
    token: str,
    metric_name: str,
    breakdown: str,
) -> dict[str, Any]:
    """Fetch demographic breakdown data from the Graph API.

    Args:
        metric_name: "follower_demographics" or "engaged_audience_demographics".
        breakdown: "age", "gender", "city", or "country".

    Returns:
        The `total_value` dict from Meta's response, or {} on empty.

    Raises:
        InstagramAPIError: If the API call fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
                params={
                    "metric": metric_name,
                    "period": "lifetime",
                    "timeframe": "this_month",
                    "metric_type": "total_value",
                    "breakdown": breakdown,
                    "access_token": token,
                },
            )
            resp.raise_for_status()
            data = resp.json().get("data", [])
            if data:
                return data[0].get("total_value", {})
            return {}
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            try:
                err = exc.response.json().get("error", {})
            except Exception:
                err = {}
            if err.get("code") == 3006 or "not enough users" in body.lower():
                # WARN (not INFO) so this stays visible in default log configs —
                # users repeatedly seeing empty demographics deserve a paper
                # trail that explains why.
                logger.warning(
                    "Demographics (%s/%s) skipped by Meta: not enough users "
                    "(error code 3006) — privacy threshold not met yet.",
                    metric_name, breakdown,
                )
                return {}
            logger.error(
                "Failed to fetch demographics (%s/%s): %s",
                metric_name, breakdown, body,
            )
            raise InstagramAPIError(
                f"Failed to fetch demographics for {metric_name}/{breakdown}"
            )
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch demographics (%s/%s): %s", metric_name, breakdown, exc)
            raise InstagramAPIError(
                f"Failed to fetch demographics for {metric_name}/{breakdown}"
            )


async def fetch_comments_for_media(
    media_id: str,
    token: str,
    max_pages: int = 5,
) -> list[dict[str, Any]]:
    """Fetch up to `max_pages` of comments + their replies for one media item.

    Top-level comments and their replies are flattened into a single list; the
    repository tags replies with `parent_comment_id` so threading can be
    reconstructed later.
    """
    comments: list[dict[str, Any]] = []
    url = f"{GRAPH_BASE_URL}/{media_id}/comments"
    params: dict[str, Any] = {
        "fields": (
            "id,text,username,like_count,timestamp,"
            "replies{id,text,username,like_count,timestamp}"
        ),
        "access_token": token,
        "limit": 50,
    }

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        for _ in range(max_pages):
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("Failed to fetch comments for %s: %s", media_id, exc)
                break

            payload = resp.json()
            page = payload.get("data", []) or []
            for c in page:
                comments.append({**c, "_parent_id": ""})
                replies = (c.get("replies") or {}).get("data") or []
                for r in replies:
                    comments.append({**r, "_parent_id": c.get("id", "")})

            paging = payload.get("paging", {}) or {}
            next_url = paging.get("next")
            after = (paging.get("cursors") or {}).get("after")
            if not next_url or not after:
                break
            params["after"] = after

    return comments


async def post_comment_reply(comment_id: str, message: str, token: str) -> str:
    """Post a reply under a comment via POST /{comment-id}/replies.

    This is the only write the app performs against the Graph API; it's
    covered by the `instagram_business_manage_comments` scope requested
    during OAuth.

    Returns:
        The new reply's IG comment id.

    Raises:
        InstagramAPIError: If the reply could not be posted.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(
                f"{GRAPH_BASE_URL}/{comment_id}/replies",
                data={"message": message, "access_token": token},
            )
            resp.raise_for_status()
            return str(resp.json().get("id", ""))
        except httpx.HTTPStatusError as exc:
            logger.error("Comment reply failed for %s: %s", comment_id, exc.response.text)
            raise InstagramAPIError("Failed to post the reply to Instagram")
        except httpx.HTTPError as exc:
            logger.error("Comment reply failed for %s: %s", comment_id, exc)
            raise InstagramAPIError("Failed to post the reply to Instagram")


async def fetch_media_insights(
    media_id: str,
    token: str,
    media_product_type: str,
) -> list[dict[str, Any]]:
    """Fetch per-media insights from the Graph API.

    Args:
        media_product_type: "REELS", "STORY", or any other value (treated as feed post).

    Returns:
        Raw `data` array from Meta's response.

    Raises:
        InstagramAPIError: If the API call fails.
    """
    if media_product_type == "REELS":
        metrics = MEDIA_REELS_METRICS
    elif media_product_type == "STORY":
        metrics = MEDIA_STORY_METRICS
    else:
        metrics = MEDIA_FEED_METRICS

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/{media_id}/insights",
                params={"metric": metrics, "access_token": token},
            )
            resp.raise_for_status()
            return resp.json().get("data", [])
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Failed to fetch media insights for %s: %s", media_id, exc.response.text
            )
            raise InstagramAPIError(f"Failed to fetch media insights for {media_id}")
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch media insights for %s: %s", media_id, exc)
            raise InstagramAPIError(f"Failed to fetch media insights for {media_id}")

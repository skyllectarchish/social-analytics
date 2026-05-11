"""Instagram Graph API client — async HTTP operations only.

All database operations are handled by app.repositories.instagram_repo.
This module is responsible only for Meta/Instagram API communication.
"""

import asyncio
import logging
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx

from ..config import settings
from ..constants import (
    ACCOUNT_DEMOGRAPHIC_METRICS,
    ACCOUNT_TIME_SERIES_METRICS,
    ACCOUNT_TOTAL_VALUE_METRICS,
    DEFAULT_MEDIA_FETCH_LIMIT,
    GRAPH_BASE_URL,
    HTTP_TIMEOUT_SECONDS,
    INSTAGRAM_MEDIA_FIELDS,
    INSTAGRAM_PROFILE_FIELDS,
    MEDIA_FEED_METRICS,
    MEDIA_REELS_METRICS,
    MEDIA_STORY_METRICS,
    OAUTH_DIALOG_URL,
    REQUIRED_INSTAGRAM_SCOPES,
    STORY_FIELDS,
)
from ..exceptions import InstagramAPIError, OAuthError

logger = logging.getLogger(__name__)


def generate_oauth_state() -> str:
    """Generate a cryptographically random state token for CSRF protection."""
    return secrets.token_urlsafe(32)


def get_oauth_url(state: str) -> str:
    """Construct the Meta OAuth dialog URL.

    Args:
        state: CSRF token (mandatory). Must be verified on callback.
    """
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": ",".join(REQUIRED_INSTAGRAM_SCOPES),
        "response_type": "code",
        "state": state,
    }
    return f"{OAUTH_DIALOG_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    """Exchange an OAuth authorization code for a short-lived access token.

    Raises:
        OAuthError: If the token exchange fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/oauth/access_token",
                params={
                    "client_id": settings.meta_app_id,
                    "client_secret": settings.meta_app_secret,
                    "redirect_uri": settings.meta_redirect_uri,
                    "code": code,
                },
            )
            resp.raise_for_status()
            return resp.json()["access_token"]
        except httpx.HTTPStatusError as exc:
            logger.error("Token exchange failed: %s", exc.response.text)
            raise OAuthError("Failed to exchange authorization code for token")
        except (KeyError, httpx.HTTPError) as exc:
            logger.error("Token exchange error: %s", exc)
            raise OAuthError("Invalid response from Meta token endpoint")


async def get_long_lived_token(short_token: str) -> tuple[str, int]:
    """Exchange a short-lived token for a long-lived token (60 days).

    Returns:
        Tuple of (long_lived_token, expires_in_seconds).

    Raises:
        OAuthError: If the exchange fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": settings.meta_app_id,
                    "client_secret": settings.meta_app_secret,
                    "fb_exchange_token": short_token,
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
            raise OAuthError("Invalid response from Meta token endpoint")


async def get_instagram_business_account(token: str) -> tuple[str, str]:
    """Discover the Instagram Business Account ID linked to the user's Facebook Pages.

    Returns:
        Tuple of (ig_user_id, page_access_token).

    Raises:
        InstagramAPIError: If no IG business account is found.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/me/accounts",
                params={"access_token": token, "fields": "id,name,instagram_business_account,access_token"},
            )
            resp.raise_for_status()
            pages = resp.json().get("data", [])
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch Facebook pages: %s", exc)
            raise InstagramAPIError("Failed to retrieve Facebook pages")

    for page in pages:
        ig_account = page.get("instagram_business_account")
        if ig_account:
            page_token = page.get("access_token")
            if not page_token:
                logger.warning("No page access token found, falling back to user token")
                page_token = token
                
            logger.info("Found Instagram business account: %s", ig_account["id"])
            return ig_account["id"], page_token

    raise InstagramAPIError("No Instagram Business/Creator account linked to any Facebook Page")


async def fetch_profile(ig_user_id: str, token: str) -> dict[str, Any]:
    """Fetch the Instagram user's profile data.

    Raises:
        InstagramAPIError: If the API call fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}",
                params={"fields": INSTAGRAM_PROFILE_FIELDS, "access_token": token},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch Instagram profile: %s", exc)
            raise InstagramAPIError("Failed to fetch Instagram profile")


async def fetch_media(
    ig_user_id: str,
    token: str,
    limit: int = DEFAULT_MEDIA_FETCH_LIMIT,
) -> list[dict[str, Any]]:
    """Fetch all media items for an Instagram user (handles pagination).

    Raises:
        InstagramAPIError: If any API call fails during pagination.
    """
    media_items: list[dict[str, Any]] = []
    url = f"{GRAPH_BASE_URL}/{ig_user_id}/media"
    params: dict[str, Any] = {
        "fields": INSTAGRAM_MEDIA_FIELDS,
        "access_token": token,
        "limit": limit,
    }

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        while True:
            try:
                logger.info("Fetching media page for %s", ig_user_id)
                
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                
                media_items.extend(data.get("data", []))
                
                # Pagination: use the `after` cursor to stay on GRAPH_BASE_URL (v21.0)
                # Meta's raw `next` URL often forces v25.0 which can trigger #200 errors.
                paging = data.get("paging", {})
                after_cursor = paging.get("cursors", {}).get("after")
                
                # Only continue if there is a next URL AND an after cursor
                if not paging.get("next") or not after_cursor:
                    break
                    
                params["after"] = after_cursor
                
            except httpx.HTTPError as exc:
                error_body = getattr(exc, "response", None)
                if error_body is not None:
                    logger.error("Failed to fetch media page: %s - Response: %s", exc, error_body.text)
                else:
                    logger.error("Failed to fetch media page: %s", exc)
                raise InstagramAPIError("Failed to fetch Instagram media")

    logger.info("Fetched %d media items for ig_user %s", len(media_items), ig_user_id)
    return media_items


async def fetch_media_insights_batch(
    media_items: list[tuple[str, str]],
    token: str,
    max_retries: int = 3,
) -> dict[str, list[dict[str, Any]]]:
    """Fetch insights for multiple media items with rate-limit handling.

    Args:
        media_items: List of (ig_media_id, media_type) tuples.

    Returns:
        {ig_media_id: [insight_data, ...]}
    """
    results: dict[str, list[dict[str, Any]]] = {}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        for media_id, media_type in media_items:
            if media_type in ("VIDEO", "REEL"):
                metrics = MEDIA_REELS_METRICS
            elif media_type == "STORY":
                metrics = MEDIA_STORY_METRICS
            else:
                # IMAGE, CAROUSEL_ALBUM, and any other types use feed metrics
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
                    else:
                        logger.error(
                            "Failed insights for %s (HTTP %d): %s",
                            media_id, exc.response.status_code, exc.response.text,
                        )
                        break
                except httpx.HTTPError as exc:
                    logger.error("Failed insights for %s: %s", media_id, exc)
                    break

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


async def fetch_account_insights(
    ig_user_id: str,
    token: str,
    since: int,
    until: int,
) -> list[dict[str, Any]]:
    """Fetch account insights: time-series metrics + total-value metrics (two calls).

    Returns a unified list in the same shape as Meta's time_series response:
    [{name, values: [{value, end_time}]}]
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        # Call 1: time-series metrics (reach, follows_and_unfollows, etc.)
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
                params={
                    "metric": ACCOUNT_TIME_SERIES_METRICS,
                    "period": "day",
                    "metric_type": "time_series",
                    "since": since,
                    "until": until,
                    "access_token": token,
                },
            )
            resp.raise_for_status()
            results = resp.json().get("data", [])
        except httpx.HTTPStatusError as exc:
            logger.error("Failed to fetch account insights (time_series): %s", exc.response.text)
            raise InstagramAPIError("Failed to fetch account insights")
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch account insights (time_series): %s", exc)
            raise InstagramAPIError("Failed to fetch account insights")

        # Call 2: total_value metrics (views) — normalize to same shape
        try:
            resp2 = await client.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
                params={
                    "metric": ACCOUNT_TOTAL_VALUE_METRICS,
                    "period": "day",
                    "metric_type": "total_value",
                    "since": since,
                    "until": until,
                    "access_token": token,
                },
            )
            resp2.raise_for_status()
            from datetime import datetime, timezone as _tz
            now_iso = datetime.now(_tz.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
            for entry in resp2.json().get("data", []):
                total = entry.get("total_value", {}).get("value", 0)
                results.append({
                    "name": entry.get("name", ""),
                    "values": [{"value": total, "end_time": now_iso}],
                })
        except httpx.HTTPStatusError as exc:
            logger.warning("Failed to fetch account insights (total_value): %s", exc.response.text)
        except httpx.HTTPError as exc:
            logger.warning("Failed to fetch account insights (total_value): %s", exc)

        return results


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
            logger.error(
                "Failed to fetch demographics (%s/%s): %s",
                metric_name, breakdown, exc.response.text,
            )
            raise InstagramAPIError(
                f"Failed to fetch demographics for {metric_name}/{breakdown}"
            )
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch demographics (%s/%s): %s", metric_name, breakdown, exc)
            raise InstagramAPIError(
                f"Failed to fetch demographics for {metric_name}/{breakdown}"
            )


async def fetch_media_insights(
    media_id: str,
    token: str,
    media_type: str,
) -> list[dict[str, Any]]:
    """Fetch per-media insights from the Graph API.

    Args:
        media_type: "REEL", "STORY", or any other value (treated as feed post).

    Returns:
        Raw `data` array from Meta's response.

    Raises:
        InstagramAPIError: If the API call fails.
    """
    if media_type in ("VIDEO", "REEL"):
        metrics = MEDIA_REELS_METRICS
    elif media_type == "STORY":
        metrics = MEDIA_STORY_METRICS
    else:
        # IMAGE, CAROUSEL_ALBUM, and any other types use feed metrics
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

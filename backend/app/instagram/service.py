"""Instagram Login API client — async HTTP operations only.

All database operations are handled by app.repositories.instagram_repo.
This module is responsible only for Instagram API communication.
"""

import asyncio
import json
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
        media_items: List of (ig_media_id, media_product_type) tuples.

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

        # Call 3: batch request for follows_and_unfollows + total_interactions (time series recreation)
        try:
            from datetime import datetime, timezone as _tz, timedelta
            since_dt = datetime.fromtimestamp(since, tz=_tz.utc)
            until_dt = datetime.fromtimestamp(until, tz=_tz.utc)

            batch_requests = []
            days_list = []
            current_dt = since_dt

            all_follows_values = []
            all_total_interactions_values = []
            all_accounts_engaged_values = []
            all_saves_values = []
            all_shares_values = []

            while current_dt < until_dt:
                next_dt = current_dt + timedelta(days=1)
                if next_dt > until_dt:
                    next_dt = until_dt

                rel_url = f"{ig_user_id}/insights?metric=follows_and_unfollows,total_interactions,accounts_engaged,saves,shares&period=day&metric_type=total_value&since={int(current_dt.timestamp())}&until={int(next_dt.timestamp())}"
                batch_requests.append({
                    "method": "GET",
                    "relative_url": rel_url
                })
                days_list.append(next_dt)
                current_dt = next_dt

                # Meta limits batches to 50 operations. Chunk if needed.
                if len(batch_requests) == 50 or current_dt >= until_dt:
                    batch_payload = {"access_token": token, "batch": json.dumps(batch_requests)}
                    resp3 = await client.post(GRAPH_BASE_URL, data=batch_payload)
                    resp3.raise_for_status()

                    batch_responses = resp3.json()

                    for i, batch_res in enumerate(batch_responses):
                        if batch_res.get("code") == 200:
                            body = json.loads(batch_res.get("body", "{}"))
                            data = body.get("data", [])
                            end_time_iso = days_list[i].strftime("%Y-%m-%dT%H:%M:%S+0000")
                            for entry in data:
                                total = entry.get("total_value", {}).get("value", 0)
                                name = entry.get("name", "")
                                if name == "follows_and_unfollows":
                                    all_follows_values.append({"value": total, "end_time": end_time_iso})
                                elif name == "total_interactions":
                                    all_total_interactions_values.append({"value": total, "end_time": end_time_iso})
                                elif name == "accounts_engaged":
                                    all_accounts_engaged_values.append({"value": total, "end_time": end_time_iso})
                                elif name == "saves":
                                    all_saves_values.append({"value": total, "end_time": end_time_iso})
                                elif name == "shares":
                                    all_shares_values.append({"value": total, "end_time": end_time_iso})

                    # Reset for next chunk
                    batch_requests = []
                    days_list = []

            if all_follows_values:
                results.append({"name": "follows_and_unfollows", "values": all_follows_values})
            if all_total_interactions_values:
                results.append({"name": "total_interactions", "values": all_total_interactions_values})
            if all_accounts_engaged_values:
                results.append({"name": "accounts_engaged", "values": all_accounts_engaged_values})
            if all_saves_values:
                results.append({"name": "saves", "values": all_saves_values})
            if all_shares_values:
                results.append({"name": "shares", "values": all_shares_values})

        except httpx.HTTPStatusError as exc:
            logger.warning("Failed to fetch account insights (batch follows_and_unfollows): %s", exc.response.text)
        except httpx.HTTPError as exc:
            logger.warning("Failed to fetch account insights (batch follows_and_unfollows): %s", exc)

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
            body = exc.response.text
            try:
                err = exc.response.json().get("error", {})
            except Exception:
                err = {}
            if err.get("code") == 3006 or "not enough users" in body.lower():
                logger.info(
                    "Demographics (%s/%s) skipped: not enough users",
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

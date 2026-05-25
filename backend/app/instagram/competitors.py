"""Competitor benchmarking — Meta Graph Business Discovery wrapper.

Lookup a public IG Business/Creator handle's profile + last 25 public posts
using the authenticated user's existing token. Charged against the user's app
quota, not the competitor's.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from ..constants import GRAPH_BASE_URL, HTTP_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

#: Public fields fetched per competitor (profile + last 25 posts).
BUSINESS_DISCOVERY_FIELDS: str = (
    "username,name,profile_picture_url,followers_count,media_count,"
    "media.limit(25){id,media_type,media_product_type,caption,timestamp,"
    "like_count,comments_count,permalink,thumbnail_url,media_url}"
)

# Defense-in-depth: the router-level Pydantic schema already validates the
# handle, but interpolating it into Meta's Graph DSL means a regression in
# that validation could let an attacker chain extra `username(...)` clauses.
# Reject anything that doesn't match Instagram's actual handle character set.
_HANDLE_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")


async def fetch_competitor_snapshot(
    my_ig_user_id: str,
    handle: str,
    token: str,
) -> tuple[dict[str, Any] | None, str | None]:
    """Fetch one public business-discovery snapshot.

    Returns `(business_discovery_dict, None)` on success. On failure returns
    `(None, error_message)` where `error_message` is Meta's own error string
    when available, or a synthesized one for network / non-200 cases. Callers
    that only care about success can ignore the second element.
    """
    if not _HANDLE_RE.match(handle):
        # Should never reach here if the router validation is intact, but the
        # interpolation below is part of Meta's Graph DSL — refuse anything
        # weird rather than send it.
        return None, "Invalid Instagram handle format."

    url = f"{GRAPH_BASE_URL}/{my_ig_user_id}"
    params = {
        "fields": (
            f"business_discovery.username({handle}){{{BUSINESS_DISCOVERY_FIELDS}}}"
        ),
        "access_token": token,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            logger.warning("business_discovery network error for %s: %s", handle, exc)
            return None, "Couldn't reach Instagram. Try again in a moment."

    if resp.status_code == 400:
        # Meta returns 400 for handle-not-found, private, or personal accounts,
        # plus a separate class of "your own IG account isn't eligible for
        # business_discovery" errors that need to be surfaced to the user.
        try:
            body = resp.json()
        except ValueError:
            body = {}
        meta_msg = (body.get("error") or {}).get("message")
        logger.info(
            "business_discovery 400 for %s: %s", handle, meta_msg,
        )
        return None, meta_msg or "Instagram rejected this handle."
    if resp.status_code != 200:
        logger.warning(
            "business_discovery HTTP %d for %s: %s",
            resp.status_code, handle, resp.text[:300],
        )
        return None, f"Instagram returned HTTP {resp.status_code}."

    payload = resp.json()
    snap = payload.get("business_discovery")
    if not snap:
        # Some misconfigurations return 200 with no business_discovery key —
        # treat as not-found so the FE can render a clear message.
        return None, "Instagram returned no profile for this handle."
    return snap, None


def _parse_timestamp(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def derive_snapshot_metrics(business_discovery: dict[str, Any]) -> dict[str, Any]:
    """Reduce Meta's business_discovery payload to our snapshot row shape."""
    followers = int(business_discovery.get("followers_count") or 0)
    media_count = int(business_discovery.get("media_count") or 0)
    media = (business_discovery.get("media") or {}).get("data") or []

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=7)
    last_7d = []
    for m in media:
        ts = _parse_timestamp(m.get("timestamp"))
        if ts is not None and ts >= cutoff:
            last_7d.append(m)

    reels_7d = sum(1 for m in last_7d if (m.get("media_product_type") or "") == "REELS")
    carousels_7d = sum(
        1 for m in last_7d if (m.get("media_type") or "") == "CAROUSEL_ALBUM"
    )

    likes = [int(m.get("like_count") or 0) for m in media]
    comments = [int(m.get("comments_count") or 0) for m in media]
    avg_likes = sum(likes) / len(likes) if likes else 0.0
    avg_comments = sum(comments) / len(comments) if comments else 0.0
    # Engagement = (likes + comments) / followers, averaged across the 25 posts.
    if followers > 0 and media:
        per_post = [
            (l + c) / followers * 100.0 for l, c in zip(likes, comments)
        ]
        avg_engagement_rate_pct = sum(per_post) / len(per_post)
    else:
        avg_engagement_rate_pct = 0.0

    return {
        "followers_count": followers,
        "media_count": media_count,
        "posts_last_7d": len(last_7d),
        "reels_last_7d": reels_7d,
        "carousels_last_7d": carousels_7d,
        "avg_likes_last_25": float(avg_likes),
        "avg_comments_last_25": float(avg_comments),
        "avg_engagement_rate_pct": float(avg_engagement_rate_pct),
    }

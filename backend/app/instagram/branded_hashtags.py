"""Branded hashtag tracking — Meta Graph ig_hashtag_search + recent_media wrapper.

Meta enforces a quota of ~30 hashtag queries per IG user per rolling 7 days.
Each tracked hashtag costs at most 2 queries on the first sync (search to
resolve the hashtag id, then recent_media) and 1 query on subsequent syncs
(recent_media only — the id is cached on `branded_hashtags`). With the
default cap of MAX_BRANDED_HASHTAGS=3 and weekly job cadence, total weekly
quota usage is at most 6 calls — well under Meta's limit.

The `recent_media` edge returns top-performing recent posts from any public
Business/Creator account that used the hashtag in the last ~24 hours; it does
*not* return historical posts. Daily/weekly accumulation in
`branded_hashtag_mentions` builds the corpus over time.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..constants import GRAPH_BASE_URL, HTTP_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

#: Fields requested from /<HASHTAG_ID>/recent_media. The Graph API only
#: returns id by default — we explicitly enumerate the public mention fields
#: we want to persist.
RECENT_MEDIA_FIELDS: str = (
    "id,media_type,permalink,caption,timestamp,like_count,comments_count"
)


async def search_hashtag_id(
    my_ig_user_id: str, hashtag: str, token: str,
) -> str | None:
    """Resolve a hashtag name to its Meta hashtag node id.

    Returns None when Meta rejects the query (rate-limited, malformed name,
    or the hashtag genuinely has no media). One query counts against the
    user's 30-per-7d hashtag quota.
    """
    url = f"{GRAPH_BASE_URL}/ig_hashtag_search"
    params = {"user_id": my_ig_user_id, "q": hashtag, "access_token": token}
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            logger.warning("ig_hashtag_search network error for %s: %s", hashtag, exc)
            return None

    if resp.status_code != 200:
        logger.info(
            "ig_hashtag_search HTTP %d for %s: %s",
            resp.status_code, hashtag, resp.text[:300],
        )
        return None

    data = resp.json().get("data") or []
    if not data:
        return None
    return str(data[0].get("id") or "") or None


async def fetch_recent_media(
    my_ig_user_id: str, ig_hashtag_id: str, token: str, limit: int = 25,
) -> list[dict[str, Any]]:
    """Return recent public media mentioning the hashtag.

    Meta only exposes a rolling ~24-hour window — historical posts are not
    available. The caller is expected to accumulate snapshots over time.
    """
    url = f"{GRAPH_BASE_URL}/{ig_hashtag_id}/recent_media"
    params = {
        "user_id": my_ig_user_id,
        "fields": RECENT_MEDIA_FIELDS,
        "limit": limit,
        "access_token": token,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            logger.warning(
                "recent_media network error for hashtag id %s: %s",
                ig_hashtag_id, exc,
            )
            return []

    if resp.status_code != 200:
        logger.info(
            "recent_media HTTP %d for hashtag id %s: %s",
            resp.status_code, ig_hashtag_id, resp.text[:300],
        )
        return []
    return resp.json().get("data") or []

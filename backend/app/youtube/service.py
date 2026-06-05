"""YouTube API client — async HTTP operations only."""

import logging
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from ..config import settings
from ..constants import (
    HTTP_TIMEOUT_SECONDS,
    YOUTUBE_DATA_API_BASE,
    YOUTUBE_ANALYTICS_API_BASE,
    YOUTUBE_OAUTH_DIALOG_URL,
    YOUTUBE_TOKEN_EXCHANGE_URL,
    YOUTUBE_REQUIRED_SCOPES,
    YOUTUBE_ANALYTICS_OVERVIEW_METRICS,
)
from ..exceptions import OAuthError

logger = logging.getLogger(__name__)


class YouTubeAPIError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def get_oauth_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "scope": " ".join(YOUTUBE_REQUIRED_SCOPES),
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{YOUTUBE_OAUTH_DIALOG_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> tuple[str, str]:
    """Returns (access_token, refresh_token)."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(
                YOUTUBE_TOKEN_EXCHANGE_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                    "code": code,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            return body["access_token"], body["refresh_token"]
        except (KeyError, httpx.HTTPStatusError, httpx.HTTPError) as exc:
            logger.error("YouTube token exchange failed: %s", exc)
            raise OAuthError("Failed to exchange YouTube authorization code")


async def refresh_access_token(refresh_token: str) -> str:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(
                YOUTUBE_TOKEN_EXCHANGE_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
            )
            resp.raise_for_status()
            return resp.json()["access_token"]
        except (KeyError, httpx.HTTPStatusError, httpx.HTTPError) as exc:
            logger.error("YouTube token refresh failed: %s", exc)
            raise OAuthError("Failed to refresh YouTube access token")


async def fetch_channel(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/channels",
            params={"part": "snippet,statistics", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            raise YouTubeAPIError("No YouTube channel found for this account")
        item = items[0]
        stats = item.get("statistics", {})
        snippet = item.get("snippet", {})
        return {
            "yt_channel_id": item["id"],
            "title": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
            "subscriber_count": int(stats.get("subscriberCount", 0)),
            "video_count": int(stats.get("videoCount", 0)),
            "view_count": int(stats.get("viewCount", 0)),
            "hidden_subscriber_count": stats.get("hiddenSubscriberCount", False),
        }


def _parse_iso_duration(iso: str) -> int:
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    return int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)


def _derive_format(duration_seconds: int, live_broadcast_content: str) -> str:
    if live_broadcast_content in ("live", "upcoming"):
        return "LIVE"
    if duration_seconds <= 60:
        return "SHORT"
    return "LONG_FORM"


async def fetch_latest_videos(channel_id: str, access_token: str, max_results: int = 50) -> list[dict]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        search_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/search",
            params={
                "part": "id", "channelId": channel_id, "type": "video",
                "order": "date", "maxResults": max_results,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        search_resp.raise_for_status()
        video_ids = [
            item["id"]["videoId"]
            for item in search_resp.json().get("items", [])
            if item.get("id", {}).get("videoId")
        ]
        if not video_ids:
            return []

        videos_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/videos",
            params={"part": "snippet,statistics,contentDetails", "id": ",".join(video_ids)},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        videos_resp.raise_for_status()

        results = []
        for item in videos_resp.json().get("items", []):
            snippet = item.get("snippet", {})
            stats = item.get("statistics", {})
            content = item.get("contentDetails", {})
            duration_s = _parse_iso_duration(content.get("duration", ""))
            lbc = snippet.get("liveBroadcastContent", "none")
            try:
                published_at = datetime.fromisoformat(
                    snippet.get("publishedAt", "").replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except (ValueError, AttributeError):
                published_at = datetime.now(timezone.utc).replace(tzinfo=None)
            results.append({
                "video_id": item["id"],
                "title": snippet.get("title", ""),
                "description": snippet.get("description", "")[:500],
                "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
                "published_at": published_at,
                "duration_seconds": duration_s,
                "video_format": _derive_format(duration_s, lbc),
                "view_count": int(stats.get("viewCount", 0)),
                "like_count": int(stats.get("likeCount", 0)),
                "comment_count": int(stats.get("commentCount", 0)),
            })
        return results


async def fetch_analytics_overview(
    channel_id: str,
    access_token: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_ANALYTICS_API_BASE}/reports",
            params={
                "ids": f"channel=={channel_id}",
                "startDate": start_date,
                "endDate": end_date,
                "metrics": YOUTUBE_ANALYTICS_OVERVIEW_METRICS,
                "dimensions": "day",
                "sort": "day",
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        col_names = [c["name"] for c in data.get("columnHeaders", [])]
        rows = []
        for row in data.get("rows", []):
            row_dict = dict(zip(col_names, row))
            try:
                end_time = datetime.strptime(row_dict["day"], "%Y-%m-%d").replace(hour=12)
            except (KeyError, ValueError):
                continue
            for metric in YOUTUBE_ANALYTICS_OVERVIEW_METRICS.split(","):
                if metric in row_dict:
                    rows.append({
                        "metric_name": metric,
                        "metric_value": float(row_dict[metric]),
                        "end_time": end_time,
                    })
        return rows


async def fetch_retention_curve(channel_id: str, video_id: str, access_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_ANALYTICS_API_BASE}/reports",
            params={
                "ids": f"channel=={channel_id}",
                "metrics": "audienceWatchRatio,relativeRetentionPerformance",
                "dimensions": "elapsedVideoTimeRatio",
                "filters": f"video=={video_id}",
                "startDate": "2020-01-01",
                "endDate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        col_names = [c["name"] for c in data.get("columnHeaders", [])]
        return [
            {
                "elapsed_video_time_ratio": float(dict(zip(col_names, row)).get("elapsedVideoTimeRatio", 0)),
                "audience_watch_ratio": float(dict(zip(col_names, row)).get("audienceWatchRatio", 0)),
                "relative_retention_performance": float(dict(zip(col_names, row)).get("relativeRetentionPerformance", 0)),
            }
            for row in data.get("rows", [])
        ]


async def fetch_captions(video_id: str, access_token: str) -> str | None:
    """Returns VTT caption text, or None if unavailable."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        list_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/captions",
            params={"part": "snippet", "videoId": video_id},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if list_resp.status_code != 200:
            return None
        items = list_resp.json().get("items", [])
        if not items:
            return None
        manual = [i for i in items if i["snippet"]["trackKind"] != "asr"]
        caption_id = (manual or items)[0]["id"]
        dl_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/captions/{caption_id}",
            params={"tfmt": "vtt"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return dl_resp.text if dl_resp.status_code == 200 else None

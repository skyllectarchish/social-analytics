import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from ..config import settings
from ..database import get_client

GRAPH_BASE = "https://graph.facebook.com/v25.0"

REQUIRED_SCOPES = [
    "instagram_basic",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_manage_insights",
    "business_management",
]


def get_oauth_url(state: str = "") -> str:
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": ",".join(REQUIRED_SCOPES),
        "response_type": "code",
    }
    if state:
        params["state"] = state
    return f"https://www.facebook.com/v25.0/dialog/oauth?{urlencode(params)}"


def exchange_code_for_token(code: str) -> str:
    resp = httpx.get(
        f"{GRAPH_BASE}/oauth/access_token",
        params={
            "client_id": settings.meta_app_id,
            "client_secret": settings.meta_app_secret,
            "redirect_uri": settings.meta_redirect_uri,
            "code": code,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_long_lived_token(short_token: str) -> tuple[str, int]:
    resp = httpx.get(
        f"{GRAPH_BASE}/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": settings.meta_app_id,
            "client_secret": settings.meta_app_secret,
            "fb_exchange_token": short_token,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["access_token"], data.get("expires_in", 5184000)


def get_instagram_business_account(token: str) -> tuple[str, str]:
    resp = httpx.get(
        f"{GRAPH_BASE}/me/accounts",
        params={"access_token": token, "fields": "id,name,instagram_business_account"},
        timeout=30,
    )
    resp.raise_for_status()
    pages = resp.json().get("data", [])

    for page in pages:
        ig_account = page.get("instagram_business_account")
        if ig_account:
            return ig_account["id"], token

    raise ValueError("No Instagram Business/Creator account linked to any Facebook Page")


def fetch_profile(ig_user_id: str, token: str) -> dict[str, Any]:
    fields = "username,name,biography,profile_picture_url,followers_count,follows_count,media_count"
    resp = httpx.get(
        f"{GRAPH_BASE}/{ig_user_id}",
        params={"fields": fields, "access_token": token},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_media(ig_user_id: str, token: str, limit: int = 50) -> list[dict[str, Any]]:
    fields = "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count"
    media_items = []
    url = f"{GRAPH_BASE}/{ig_user_id}/media"
    params: dict[str, Any] = {"fields": fields, "access_token": token, "limit": limit}

    while url:
        resp = httpx.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        media_items.extend(data.get("data", []))
        paging = data.get("paging", {})
        url = paging.get("next")
        params = {}

    return media_items


def store_profile(user_id: str, ig_user_id: str, profile: dict[str, Any], token: str, expires_in: int) -> None:
    client = get_client()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    token_expires = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + expires_in, tz=timezone.utc
    ).replace(tzinfo=None)

    client.insert(
        "instagram_profiles",
        [[
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            profile.get("username", ""),
            profile.get("name", ""),
            profile.get("biography", ""),
            profile.get("profile_picture_url", ""),
            profile.get("followers_count", 0),
            profile.get("follows_count", 0),
            profile.get("media_count", 0),
            token,
            token_expires,
            now,
            now,
        ]],
        column_names=[
            "id", "user_id", "ig_user_id", "username", "name", "biography",
            "profile_picture_url", "followers_count", "follows_count", "media_count",
            "access_token", "token_expires_at", "connected_at", "updated_at",
        ],
    )


def store_media(user_id: str, ig_user_id: str, media_list: list[dict[str, Any]]) -> None:
    if not media_list:
        return
    client = get_client()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    rows = []
    for item in media_list:
        ts_str = item.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            ts = now

        rows.append([
            str(uuid.uuid4()),
            item.get("id", ""),
            ig_user_id,
            user_id,
            item.get("media_type", "IMAGE"),
            item.get("media_url", ""),
            item.get("thumbnail_url", ""),
            item.get("permalink", ""),
            item.get("caption", ""),
            ts,
            item.get("like_count", 0),
            item.get("comments_count", 0),
            now,
        ])

    client.insert(
        "instagram_media",
        rows,
        column_names=[
            "id", "ig_media_id", "ig_user_id", "user_id", "media_type",
            "media_url", "thumbnail_url", "permalink", "caption",
            "timestamp", "like_count", "comments_count", "fetched_at",
        ],
    )

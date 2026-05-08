"""Instagram repository — all ClickHouse operations for instagram_profiles and instagram_media."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.instagram_media import IGMedia
from ..models.instagram_profile import IGProfile
from ..models.queries import (
    COUNT_INSTAGRAM_MEDIA,
    GET_INSTAGRAM_MEDIA_PAGE,
    GET_INSTAGRAM_PROFILE,
    GET_INSTAGRAM_TOKEN,
)

logger = logging.getLogger(__name__)


# --- Profiles ---

def find_profile(client: Client, user_id: str) -> IGProfile | None:
    """Fetch the latest Instagram profile for a user. Returns None if not connected."""
    rows = client.query(GET_INSTAGRAM_PROFILE, parameters={"user_id": user_id})
    if not rows.result_rows:
        return None
    return IGProfile.from_profile_row(rows.result_rows[0])


def find_token(client: Client, user_id: str) -> IGProfile | None:
    """Fetch the Instagram token data for a user. Returns None if not connected."""
    rows = client.query(GET_INSTAGRAM_TOKEN, parameters={"user_id": user_id})
    if not rows.result_rows:
        return None
    return IGProfile.from_token_row(rows.result_rows[0])


def upsert_profile(
    client: Client,
    user_id: str,
    ig_user_id: str,
    profile_data: dict[str, Any],
    encrypted_token: str,
    token_expires_at: datetime,
) -> None:
    """Insert or update an Instagram profile.

    Uses ReplacingMergeTree deduplication on (user_id, ig_user_id).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    client.insert(
        "instagram_profiles",
        [[
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            profile_data.get("username", ""),
            profile_data.get("name", ""),
            profile_data.get("biography", ""),
            profile_data.get("profile_picture_url", ""),
            profile_data.get("followers_count", 0),
            profile_data.get("follows_count", 0),
            profile_data.get("media_count", 0),
            encrypted_token,
            token_expires_at,
            now,
            now,
        ]],
        column_names=[
            "id", "user_id", "ig_user_id", "username", "name", "biography",
            "profile_picture_url", "followers_count", "follows_count", "media_count",
            "access_token", "token_expires_at", "connected_at", "updated_at",
        ],
    )
    logger.info("Upserted Instagram profile for user %s (ig: %s)", user_id, ig_user_id)


# --- Media ---

def count_media(client: Client, user_id: str) -> int:
    """Return the total number of media items for a user."""
    rows = client.query(COUNT_INSTAGRAM_MEDIA, parameters={"user_id": user_id})
    return rows.result_rows[0][0] if rows.result_rows else 0


def find_media_page(
    client: Client,
    user_id: str,
    limit: int,
    offset: int,
) -> list[IGMedia]:
    """Fetch a page of media items for a user, ordered by timestamp DESC."""
    rows = client.query(
        GET_INSTAGRAM_MEDIA_PAGE,
        parameters={"user_id": user_id, "limit": limit, "offset": offset},
    )
    return [IGMedia.from_row(r) for r in rows.result_rows]


def bulk_insert_media(
    client: Client,
    user_id: str,
    ig_user_id: str,
    media_list: list[dict[str, Any]],
) -> None:
    """Batch-insert media items into instagram_media."""
    if not media_list:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = []

    for item in media_list:
        ts_str = item.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
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
    logger.info("Inserted %d media items for user %s", len(rows), user_id)

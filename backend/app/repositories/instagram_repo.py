"""Instagram repository — all ClickHouse operations for instagram_profiles and instagram_media."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..instagram.hashtags import extract_hashtags
from ..models.instagram_media import IGMedia
from ..models.instagram_profile import IGProfile
from ..models.queries import (
    COUNT_INSTAGRAM_MEDIA,
    GET_INSTAGRAM_MEDIA_PAGE,
    GET_INSTAGRAM_PROFILE,
    GET_INSTAGRAM_TOKEN,
)
from .safe_query import is_schema_missing, log_schema_missing, safe_call

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


def purge_synthetic_data(
    client: Client,
    user_id: str,
) -> dict[str, int]:
    """Delete only rows that bear a synthetic-seed marker.

    Targets the markers documented in the legacy ``scripts/seed_synthetic_*``
    scripts:

    * ``instagram_media.ig_media_id`` starts with ``synth_media_``
    * ``media_insights.ig_media_id`` and ``post_hashtags.ig_media_id`` likewise
    * ``instagram_comments.ig_comment_id`` starts with ``synth_``
    * ``comment_sentiment.model = 'synthetic_v1'``
    * ``comment_topics.cluster_id >= 9000``

    Scoped to one user so an operator nuking their own demo data can't reach
    into another user's rows. Returns the count of synthetic media rows that
    existed before the wipe.
    """
    settings_block = {"mutations_sync": 2}
    params = {"uid": user_id}

    count_rows = client.query(
        "SELECT count() FROM instagram_media FINAL "
        "WHERE user_id = {uid:UUID} "
        "  AND startsWith(ig_media_id, 'synth_media_')",
        parameters=params,
    ).result_rows
    media_count = int(count_rows[0][0]) if count_rows else 0

    client.command(
        "ALTER TABLE media_insights DELETE WHERE user_id = {uid:UUID} "
        "AND startsWith(ig_media_id, 'synth_media_')",
        parameters=params, settings=settings_block,
    )
    safe_call(
        lambda: client.command(
            "ALTER TABLE post_hashtags DELETE WHERE user_id = {uid:UUID} "
            "AND startsWith(ig_media_id, 'synth_media_')",
            parameters=params, settings=settings_block,
        ),
        fallback=None,
        label="instagram_repo.purge_synth.post_hashtags",
    )
    safe_call(
        lambda: client.command(
            "ALTER TABLE instagram_comments DELETE WHERE user_id = {uid:UUID} "
            "AND startsWith(ig_comment_id, 'synth_')",
            parameters=params, settings=settings_block,
        ),
        fallback=None,
        label="instagram_repo.purge_synth.instagram_comments",
    )
    safe_call(
        lambda: client.command(
            "ALTER TABLE comment_sentiment DELETE WHERE user_id = {uid:UUID} "
            "AND (model = 'synthetic_v1' OR startsWith(ig_comment_id, 'synth_'))",
            parameters=params, settings=settings_block,
        ),
        fallback=None,
        label="instagram_repo.purge_synth.comment_sentiment",
    )
    safe_call(
        lambda: client.command(
            "ALTER TABLE comment_topics DELETE WHERE user_id = {uid:UUID} "
            "AND cluster_id >= 9000",
            parameters=params, settings=settings_block,
        ),
        fallback=None,
        label="instagram_repo.purge_synth.comment_topics",
    )
    client.command(
        "ALTER TABLE instagram_media DELETE WHERE user_id = {uid:UUID} "
        "AND startsWith(ig_media_id, 'synth_media_')",
        parameters=params, settings=settings_block,
    )

    logger.info(
        "Purged %d synthetic media rows (plus dependent rows) for user %s",
        media_count, user_id,
    )
    return {"media_deleted": media_count}


def purge_user_ig_data(
    client: Client,
    user_id: str,
    ig_user_id: str,
) -> dict[str, int]:
    """Wipe every stored row for ``(user_id, ig_user_id)`` across the data tables.

    The ``instagram_profiles`` row (containing the encrypted long-lived token)
    is preserved so the user does not have to re-OAuth. ``competitor_handles``
    / ``competitor_snapshots`` are also left alone — those are user-managed.

    Tables that don't carry ``ig_user_id`` (``media_insights``,
    ``post_hashtags``, ``instagram_comments``, ``comment_sentiment``) are
    scoped via the captured media-id list so a stale row whose source media
    has already been deleted doesn't leak across accounts.

    All ALTER DELETE mutations run with ``mutations_sync=2`` so they're
    materialized before this function returns.

    Returns a dict with the count of media rows that were targeted, useful
    for telling the user "we wiped N posts".
    """
    settings_block = {"mutations_sync": 2}

    # 1. Capture media ids BEFORE deleting instagram_media — dependent
    # tables reference them and we need to bound those deletes.
    media_rows = client.query(
        "SELECT DISTINCT ig_media_id FROM instagram_media FINAL "
        "WHERE user_id = {uid:UUID} AND ig_user_id = {iguid:String}",
        parameters={"uid": user_id, "iguid": ig_user_id},
    ).result_rows
    media_ids = [r[0] for r in media_rows if r[0]]

    # 2. media-scoped tables. media_insights is required; the comment /
    # hashtag tables are Tier 2 and may be missing on fresh deploys, so
    # they get safe_call to swallow schema-missing errors.
    if media_ids:
        bound = {"uid": user_id, "mids": media_ids}
        client.command(
            "ALTER TABLE media_insights DELETE WHERE user_id = {uid:UUID} "
            "AND ig_media_id IN {mids:Array(String)}",
            parameters=bound,
            settings=settings_block,
        )
        safe_call(
            lambda: client.command(
                "ALTER TABLE post_hashtags DELETE WHERE user_id = {uid:UUID} "
                "AND ig_media_id IN {mids:Array(String)}",
                parameters=bound,
                settings=settings_block,
            ),
            fallback=None,
            label="instagram_repo.purge.post_hashtags",
        )
        safe_call(
            lambda: client.command(
                "ALTER TABLE instagram_comments DELETE WHERE user_id = {uid:UUID} "
                "AND ig_media_id IN {mids:Array(String)}",
                parameters=bound,
                settings=settings_block,
            ),
            fallback=None,
            label="instagram_repo.purge.instagram_comments",
        )
        safe_call(
            lambda: client.command(
                "ALTER TABLE comment_sentiment DELETE WHERE user_id = {uid:UUID} "
                "AND ig_media_id IN {mids:Array(String)}",
                parameters=bound,
                settings=settings_block,
            ),
            fallback=None,
            label="instagram_repo.purge.comment_sentiment",
        )

    # 3. user-scoped derived table — has no ig_user_id / ig_media_id link.
    safe_call(
        lambda: client.command(
            "ALTER TABLE comment_topics DELETE WHERE user_id = {uid:UUID}",
            parameters={"uid": user_id},
            settings=settings_block,
        ),
        fallback=None,
        label="instagram_repo.purge.comment_topics",
    )

    # 4. instagram_media itself.
    client.command(
        "ALTER TABLE instagram_media DELETE WHERE user_id = {uid:UUID} "
        "AND ig_user_id = {iguid:String}",
        parameters={"uid": user_id, "iguid": ig_user_id},
        settings=settings_block,
    )

    # 5. account-scoped insights.
    client.command(
        "ALTER TABLE account_insights DELETE WHERE user_id = {uid:UUID} "
        "AND ig_user_id = {iguid:String}",
        parameters={"uid": user_id, "iguid": ig_user_id},
        settings=settings_block,
    )
    client.command(
        "ALTER TABLE demographic_insights DELETE WHERE user_id = {uid:UUID} "
        "AND ig_user_id = {iguid:String}",
        parameters={"uid": user_id, "iguid": ig_user_id},
        settings=settings_block,
    )

    logger.info(
        "Purged IG data for user %s ig %s: %d media rows targeted",
        user_id, ig_user_id, len(media_ids),
    )
    return {"media_deleted": len(media_ids)}


def delete_profile(client: Client, user_id: str, ig_user_id: str) -> None:
    """Remove the stored Instagram profile + encrypted token for this user.

    Backs the disconnect/logout flow. Runs synchronously (``mutations_sync=2``)
    so a subsequent ``find_profile`` reflects the disconnect immediately. Stored
    media/insights are left in place (scoped by ``ig_user_id``) — call
    :func:`purge_user_ig_data` first if the data should be wiped too.
    """
    client.command(
        "ALTER TABLE instagram_profiles DELETE "
        "WHERE user_id = {uid:UUID} AND ig_user_id = {iguid:String}",
        parameters={"uid": user_id, "iguid": ig_user_id},
        settings={"mutations_sync": 2},
    )


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

def count_media(client: Client, user_id: str, ig_user_id: str) -> int:
    """Return the total number of media items for a user's connected IG account."""
    rows = client.query(
        COUNT_INSTAGRAM_MEDIA,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id},
    )
    return rows.result_rows[0][0] if rows.result_rows else 0


def find_media_page(
    client: Client,
    user_id: str,
    ig_user_id: str,
    limit: int,
    offset: int,
) -> list[IGMedia]:
    """Fetch a page of media items for the connected IG account, ordered by timestamp DESC."""
    rows = client.query(
        GET_INSTAGRAM_MEDIA_PAGE,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "limit": limit,
            "offset": offset,
        },
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
            # Normalize through UTC first so a non-UTC-offset timestamp lands
            # at the right UTC moment before dropping tzinfo for ClickHouse.
            ts = (
                datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
        except (ValueError, TypeError):
            ts = now

        rows.append([
            str(uuid.uuid4()),
            item.get("id", ""),
            ig_user_id,
            user_id,
            item.get("media_type", "IMAGE"),
            item.get("media_product_type", ""),
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
            "media_product_type", "media_url", "thumbnail_url", "permalink", "caption",
            "timestamp", "like_count", "comments_count", "fetched_at",
        ],
    )
    logger.info("Inserted %d media items for user %s", len(rows), user_id)

    # Tier 2 / F2: hashtag denormalisation. Run inside the same insert call so a
    # sync produces both rows in one round-trip. We swallow any per-row parse
    # errors silently — captions are arbitrary text and broken regex matches
    # shouldn't break the media insert.
    _insert_hashtags_for_media(client, user_id, media_list, now)


def update_media_urls(
    client: Client,
    user_id: str,
    ig_media_id: str,
    media_url: str,
    thumbnail_url: str,
) -> None:
    """Update the media_url and thumbnail_url for a single media item.
    Used when CDN URLs expire and we fetch fresh ones.
    """
    client.command(
        "ALTER TABLE instagram_media UPDATE "
        "media_url = {murl:String}, thumbnail_url = {turl:String} "
        "WHERE user_id = {uid:UUID} AND ig_media_id = {mid:String}",
        parameters={
            "uid": user_id,
            "mid": ig_media_id,
            "murl": media_url,
            "turl": thumbnail_url,
        },
        settings={"mutations_sync": 2},
    )
    logger.info("Updated media URLs for %s", ig_media_id)


def _insert_hashtags_for_media(
    client: Client,
    user_id: str,
    media_list: list[dict[str, Any]],
    now: datetime,
) -> None:
    """Extract and bulk-insert hashtags for a list of media rows."""
    hashtag_rows: list[list[Any]] = []
    for item in media_list:
        ig_media_id = item.get("id", "")
        caption = item.get("caption", "") or ""
        ts_str = item.get("timestamp", "")
        try:
            # Normalize through UTC first so a non-UTC-offset timestamp lands
            # at the right UTC moment before dropping tzinfo for ClickHouse.
            ts = (
                datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
        except (ValueError, TypeError):
            ts = now
        media_product_type = item.get("media_product_type", "") or ""
        for tag, position in extract_hashtags(caption):
            hashtag_rows.append([
                str(uuid.uuid4()),
                user_id,
                ig_media_id,
                tag,
                position,
                ts,
                media_product_type,
                now,
            ])

    if not hashtag_rows:
        return

    try:
        client.insert(
            "post_hashtags",
            hashtag_rows,
            column_names=[
                "id", "user_id", "ig_media_id", "hashtag", "position",
                "timestamp", "media_product_type", "fetched_at",
            ],
        )
        logger.info("Inserted %d hashtag rows for user %s", len(hashtag_rows), user_id)
    except Exception as exc:
        # The post_hashtags table may not exist yet (migration 008 not run).
        # Don't fail the media sync if hashtag denorm is missing.
        if is_schema_missing(exc):
            log_schema_missing(
                "instagram_repo._insert_hashtags_for_media", exc,
                f"skipped {len(hashtag_rows)} rows — post_hashtags missing?",
            )
        else:
            raise

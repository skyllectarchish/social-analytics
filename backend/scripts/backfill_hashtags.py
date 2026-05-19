"""One-shot script: extract hashtags from existing instagram_media rows.

Run after migration 008 has been applied. Idempotent thanks to
ReplacingMergeTree on post_hashtags (ORDER BY user_id, hashtag, ig_media_id) —
re-running just overwrites the previous fetched_at.

Usage:
    cd backend
    python -m scripts.backfill_hashtags
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Allow running as `python scripts/backfill_hashtags.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_client  # noqa: E402
from app.instagram.hashtags import extract_hashtags  # noqa: E402


def main() -> int:
    client = get_client()
    rows = client.query(
        "SELECT user_id, ig_media_id, caption, timestamp, media_product_type "
        "FROM instagram_media FINAL"
    ).result_rows

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    bulk: list[list] = []
    for user_id, ig_media_id, caption, timestamp, media_product_type in rows:
        for tag, position in extract_hashtags(caption or ""):
            bulk.append([
                str(uuid.uuid4()),
                user_id,
                ig_media_id,
                tag,
                position,
                timestamp,
                media_product_type or "",
                now,
            ])

    if not bulk:
        print("No hashtags to insert.")
        return 0

    client.insert(
        "post_hashtags",
        bulk,
        column_names=[
            "id", "user_id", "ig_media_id", "hashtag", "position",
            "timestamp", "media_product_type", "fetched_at",
        ],
    )
    print(f"Inserted {len(bulk)} hashtag rows from {len(rows)} media items.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Run a full media-insights sync for the current user (bypasses the HTTP layer
so progress is visible in this terminal rather than buried in uvicorn logs).
"""

import asyncio
import sys

from app.config import settings
from app.crypto import decrypt_token
from app.database import get_client
from app.instagram import service
from app.repositories import insights_repo


def fetch_token():
    rows = get_client().query(
        "SELECT user_id, ig_user_id, access_token FROM instagram_profiles FINAL "
        "ORDER BY updated_at DESC LIMIT 1"
    ).result_rows
    if not rows:
        sys.exit("No instagram_profile rows; connect an account first.")
    user_id, ig_user_id, enc = rows[0]
    return str(user_id), ig_user_id, decrypt_token(enc, settings.jwt_secret_key)


async def main():
    user_id, ig_user_id, token = fetch_token()
    client = get_client()
    print(f"user_id={user_id}\n")

    # Force re-fetch of ALL media, not just stale ones — we want every post.
    rows = client.query(
        "SELECT ig_media_id, media_product_type FROM instagram_media FINAL "
        "WHERE user_id = {uid:UUID} ORDER BY timestamp DESC",
        parameters={"uid": user_id},
    ).result_rows
    all_media = [(r[0], r[1]) for r in rows]
    print(f"Syncing insights for {len(all_media)} media items...\n")

    results = await service.fetch_media_insights_batch(all_media, token)
    print(f"\nGot insights for {len(results)}/{len(all_media)} media items")

    inserted = 0
    for ig_media_id, raw_metrics in results.items():
        metric_rows = [
            {
                "metric_name": m["name"],
                "metric_value": m.get("values", [{}])[0].get("value", 0),
            }
            for m in raw_metrics
            if m.get("name")
        ]
        if metric_rows:
            insights_repo.bulk_upsert_media_insights(client, user_id, ig_media_id, metric_rows)
            inserted += 1
    print(f"Inserted insights for {inserted} media items\n")

    # Show coverage after
    cov = client.query(
        "SELECT count(DISTINCT ig_media_id), count() FROM media_insights FINAL "
        "WHERE user_id = {uid:UUID}",
        parameters={"uid": user_id},
    ).result_rows[0]
    print(f"media_insights now covers {cov[0]} media items, {cov[1]} total rows")


if __name__ == "__main__":
    asyncio.run(main())

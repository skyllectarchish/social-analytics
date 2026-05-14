"""Diagnostic: drive the media-insights pipeline directly.

We bypass /insights/sync (which schedules a BackgroundTask whose logs may be
hidden) and call the underlying functions inline so any errors surface here.
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
    return user_id, ig_user_id, decrypt_token(enc, settings.jwt_secret_key)


async def main():
    user_id, ig_user_id, token = fetch_token()
    client = get_client()
    print(f"user_id={user_id}  ig_user_id={ig_user_id}\n")

    print("=== Step 1: find_media_needing_sync ===")
    stale = insights_repo.find_media_needing_sync(client, str(user_id))
    print(f"  -> {len(stale)} media items need insights")
    if not stale:
        print("  (empty: nothing to fetch — but media_insights is empty too, suggesting it ran once with errors)")
        return
    for m in stale[:3]:
        print(f"    {m}")
    print()

    # Limit to 3 to keep this fast for diagnosis
    sample = stale[:3]
    print(f"=== Step 2: fetch_media_insights_batch on {len(sample)} items ===")
    results = await service.fetch_media_insights_batch(sample, token)
    print(f"  -> got {len(results)} results")
    for mid, metrics in list(results.items())[:3]:
        names = [m.get("name") for m in metrics]
        print(f"    {mid}: {names}")
    print()

    print("=== Step 3: bulk_upsert_media_insights on first result ===")
    for ig_media_id, raw_metrics in list(results.items())[:1]:
        metric_rows = [
            {
                "metric_name": m["name"],
                "metric_value": m.get("values", [{}])[0].get("value", 0),
            }
            for m in raw_metrics
            if m.get("name")
        ]
        print(f"    media_id={ig_media_id}  rows_to_insert={len(metric_rows)}")
        for r in metric_rows[:5]:
            print(f"      {r}")
        try:
            insights_repo.bulk_upsert_media_insights(client, str(user_id), ig_media_id, metric_rows)
            print("    -> bulk_upsert_media_insights OK")
        except Exception as e:
            print(f"    !! bulk_upsert FAILED: {type(e).__name__}: {e}")
    print()

    print("=== Step 4: verify it landed ===")
    rows = client.query(
        "SELECT count() FROM media_insights FINAL WHERE user_id = {uid:UUID}",
        parameters={"uid": str(user_id)},
    ).result_rows
    print(f"  media_insights row count for this user: {rows[0][0]}")


if __name__ == "__main__":
    asyncio.run(main())

"""Diagnostic: inspect what's in instagram_media and media_insights, then
run the GET_TOP_PERFORMING_MEDIA query directly to see why top_posts is empty.
Also calls Meta's /stories endpoint to check if there are live stories.
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.constants import GRAPH_BASE_URL, STORY_FIELDS
from app.crypto import decrypt_token
from app.database import get_client
from app.models.queries import GET_TOP_PERFORMING_MEDIA


def fetch_token():
    # user_id is the actual user's UUID (instagram_profiles.user_id), NOT the
    # auto-generated instagram_profiles.id.
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

    # 1. instagram_media counts
    print("=== instagram_media coverage ===")
    rows = client.query(
        """
        SELECT count() AS rows_count,
               countIf(media_product_type != '') AS has_product_type,
               min(timestamp) AS earliest,
               max(timestamp) AS latest
        FROM instagram_media FINAL
        WHERE user_id = {user_id:UUID}
        """,
        parameters={"user_id": user_id},
    ).result_rows
    r = rows[0]
    print(f"  rows={r[0]}  with_product_type={r[1]}  earliest={r[2]}  latest={r[3]}\n")

    # 2. media_insights coverage
    print("=== media_insights coverage ===")
    rows = client.query(
        """
        SELECT metric_name,
               count() AS rows_count,
               countIf(metric_value != 0) AS nonzero,
               sum(metric_value) AS sum_val
        FROM media_insights FINAL
        WHERE user_id = {user_id:UUID}
        GROUP BY metric_name
        ORDER BY metric_name
        """,
        parameters={"user_id": user_id},
    ).result_rows
    if not rows:
        print("  (empty — no media_insights rows for this user)\n")
    for r in rows:
        print(f"  {r[0]:<28} rows={r[1]:<5} nonzero={r[2]:<5} sum={r[3]}")
    print()

    # 3. Run the actual top-posts query
    print("=== GET_TOP_PERFORMING_MEDIA (limit=5) ===")
    rows = client.query(
        GET_TOP_PERFORMING_MEDIA,
        parameters={"user_id": user_id, "limit": 5},
    ).result_rows
    if not rows:
        print("  (returned 0 rows)\n")
    for r in rows:
        print(f"  media={r[0][:20]:<22} type={r[1]:<10} views={r[6]:<6} interactions={r[7]}")
    print()

    # 4. Active stories via Meta API
    print("=== Meta /stories (live) ===")
    async with httpx.AsyncClient(timeout=30) as c:
        try:
            r = await c.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}/stories",
                params={"fields": STORY_FIELDS, "access_token": token},
            )
            print(f"  status={r.status_code}")
            if r.status_code == 200:
                data = r.json().get("data", [])
                print(f"  count={len(data)}")
                for s in data[:3]:
                    print(f"  {s}")
            else:
                print(f"  body={r.text[:600]}")
        except Exception as e:
            print(f"  error={e}")


if __name__ == "__main__":
    asyncio.run(main())

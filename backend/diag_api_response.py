"""Verify what /api/instagram/insights/dashboard actually returns now."""

import json
from app.database import get_client
from app.instagram import router  # noqa: F401 (forces import)
from app.repositories import instagram_repo
from app.models.queries import GET_DASHBOARD_SUMMARY, GET_FOLLOWER_GROWTH, GET_TOP_PERFORMING_MEDIA

client = get_client()
user_id = str(client.query(
    "SELECT user_id FROM instagram_profiles FINAL ORDER BY updated_at DESC LIMIT 1"
).result_rows[0][0])
ig_profile = instagram_repo.find_profile(client, user_id)
ig_user_id = ig_profile.ig_user_id

from datetime import datetime, timedelta, timezone
_until = datetime.now(timezone.utc).replace(tzinfo=None)
_since = _until - timedelta(days=365)
top_rows = client.query(
    GET_TOP_PERFORMING_MEDIA,
    parameters={
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "since": _since,
        "until": _until,
        "limit": 5,
    },
).result_rows

# Replicate exactly what router.py:get_dashboard does:
from app.instagram.schemas import TopPost
top_posts = [
    TopPost(
        ig_media_id=r[0],
        media_type=r[1],
        permalink=r[2],
        thumbnail_url=r[3] or "",
        media_url=r[4] or "",
        caption=r[5] or "",
        views=int(r[6]),
        interactions=int(r[7]),
    )
    for r in top_rows
]

print("=== What the API will JSON-encode for top_posts[0] ===")
print(json.dumps(top_posts[0].model_dump(), indent=2)[:1200])
print()
print("=== Frontend imgSrc fallback (post.thumbnail_url || post.media_url) ===")
for tp in top_posts:
    pick = tp.thumbnail_url or tp.media_url
    is_video = pick.endswith(".mp4") or "/o1/v/t2/" in pick
    print(f"  {tp.ig_media_id} {tp.media_type:<14} picks {'VIDEO_URL!' if is_video else 'image OK'}")

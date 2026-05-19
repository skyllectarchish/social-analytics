"""Diagnostic: see what GET_TOP_PERFORMING_MEDIA returns and whether the
ordering is correct vs the underlying data.
"""

from app.database import get_client
from app.models.queries import GET_TOP_PERFORMING_MEDIA


client = get_client()
rows = client.query(
    "SELECT user_id, ig_user_id FROM instagram_profiles FINAL ORDER BY updated_at DESC LIMIT 1"
).result_rows
user_id = str(rows[0][0])
ig_user_id = str(rows[0][1])
print(f"user_id={user_id}  ig_user_id={ig_user_id}\n")

print("=== media_insights row counts per media (top 15 by row count) ===")
rows = client.query(
    """
    SELECT ig_media_id, count() AS rows_count,
           sumIf(metric_value, metric_name='total_interactions') AS total_interactions,
           sumIf(metric_value, metric_name='views') AS views,
           sumIf(metric_value, metric_name='reach') AS reach,
           sumIf(metric_value, metric_name='likes') AS likes
    FROM media_insights FINAL
    WHERE user_id = {uid:UUID}
    GROUP BY ig_media_id
    ORDER BY total_interactions DESC
    LIMIT 15
    """,
    parameters={"uid": user_id},
).result_rows
for r in rows:
    print(f"  {r[0]:<22} rows={r[1]:<3} interactions={r[2]:<8} views={r[3]:<8} reach={r[4]:<8} likes={r[5]}")
print()

print("=== GET_TOP_PERFORMING_MEDIA (limit=10) — exactly what dashboard uses ===")
from datetime import datetime, timedelta, timezone
_until = datetime.now(timezone.utc).replace(tzinfo=None)
_since = _until - timedelta(days=365)
rows = client.query(
    GET_TOP_PERFORMING_MEDIA,
    parameters={
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "since": _since,
        "until": _until,
        "limit": 10,
    },
).result_rows
for r in rows:
    # cols: ig_media_id, media_type, permalink, thumbnail_url, media_url, caption, views, interactions
    thumb = (r[3] or "")[:60]
    media = (r[4] or "")[:60]
    print(f"  {r[0]:<22} type={r[1]:<14} int={r[7]:<6} thumb={thumb!r}")
    print(f"    media_url={media!r}")

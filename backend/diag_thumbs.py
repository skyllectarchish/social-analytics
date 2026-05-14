"""Diagnostic: per-media check of thumbnail_url and media_url for top posts."""

from app.database import get_client
from app.models.queries import GET_TOP_PERFORMING_MEDIA


client = get_client()
user_id = str(client.query(
    "SELECT user_id FROM instagram_profiles FINAL ORDER BY updated_at DESC LIMIT 1"
).result_rows[0][0])


print("=== thumbnail_url coverage by media_type across instagram_media ===")
rows = client.query(
    """
    SELECT media_type,
           media_product_type,
           count() AS total,
           countIf(thumbnail_url = '') AS empty_thumbs,
           countIf(media_url = '')     AS empty_media
    FROM instagram_media FINAL
    WHERE user_id = {uid:UUID}
    GROUP BY media_type, media_product_type
    ORDER BY total DESC
    """,
    parameters={"uid": user_id},
).result_rows
for r in rows:
    print(f"  type={r[0]:<14} product={r[1]:<10} total={r[2]:<4} empty_thumb={r[3]:<4} empty_media={r[4]}")

print("\n=== top 10 posts: which URL the frontend will use ===")
top = client.query(
    GET_TOP_PERFORMING_MEDIA, parameters={"user_id": user_id, "limit": 10}
).result_rows
for r in top:
    media_id, media_type, _, thumb, media, _, _, interactions = r
    pick = thumb if thumb else media
    ext = pick.split("?")[0].rsplit(".", 1)[-1][:4]
    print(f"  {media_id} type={media_type:<14} int={interactions:<6} "
          f"thumb_set={'Y' if thumb else 'N'} media_ext=.{ext} -> picks "
          f"{'thumb' if thumb else 'media (' + ext + ')'}")

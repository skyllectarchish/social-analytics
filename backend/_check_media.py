from app.database import get_client

c = get_client()
rows = c.query("""
    SELECT p.user_id, p.username, p.media_count, coalesce(s.stored, 0)
    FROM instagram_profiles p FINAL
    LEFT JOIN (
        SELECT user_id, ig_user_id, count() AS stored
        FROM instagram_media FINAL
        GROUP BY user_id, ig_user_id
    ) s ON s.user_id = p.user_id AND s.ig_user_id = p.ig_user_id
""").result_rows
for r in rows:
    print(str(r[0])[:8], r[1], "| IG says:", r[2], "| stored:", r[3])

print()
rows2 = c.query("""
    SELECT user_id, media_type, media_product_type, count()
    FROM instagram_media FINAL
    GROUP BY user_id, media_type, media_product_type
    ORDER BY user_id
""").result_rows
for r in rows2:
    print(str(r[0])[:8], r[1] or "-", r[2] or "-", r[3])

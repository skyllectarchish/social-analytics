"""Verify the media-image proxy endpoint end-to-end with a minted token."""

import httpx

from app.database import get_client
from app.auth.service import create_access_token

client = get_client()
row = client.query(
    "SELECT user_id, ig_user_id FROM instagram_profiles FINAL ORDER BY updated_at DESC LIMIT 1"
).result_rows[0]
user_id = str(row[0])
token = create_access_token({"sub": user_id})

# A real media id for this user
media_id = str(
    client.query(
        "SELECT ig_media_id FROM instagram_media FINAL "
        "WHERE user_id = {uid:UUID} AND media_url != '' "
        "ORDER BY timestamp DESC LIMIT 1",
        parameters={"uid": user_id},
    ).result_rows[0][0]
)

base = "http://127.0.0.1:8000/api/instagram"
hdr = {"Authorization": f"Bearer {token}"}

print(f"media_id={media_id}")
r = httpx.get(f"{base}/media/{media_id}/image", headers=hdr, timeout=40)
print(f"  valid id  -> HTTP {r.status_code}  ct={r.headers.get('content-type')}  "
      f"bytes={len(r.content)}  cache={r.headers.get('cache-control')}")

r2 = httpx.get(f"{base}/media/does_not_exist_123/image", headers=hdr, timeout=20)
print(f"  bogus id  -> HTTP {r2.status_code}  body={r2.text[:120]}")

r3 = httpx.get(f"{base}/media/{media_id}/image", timeout=20)
print(f"  no token  -> HTTP {r3.status_code}")

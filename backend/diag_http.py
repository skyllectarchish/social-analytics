"""Hit the actual /api/instagram/insights/dashboard endpoint via HTTP and
print exactly what the frontend receives."""

import json
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt

from app.config import settings
from app.database import get_client


client = get_client()
user_id = str(client.query(
    "SELECT user_id FROM instagram_profiles FINAL ORDER BY updated_at DESC LIMIT 1"
).result_rows[0][0])

# Mint a short-lived access token the same way auth/service.py does
exp = datetime.now(timezone.utc) + timedelta(minutes=10)
token = jwt.encode(
    {"sub": user_id, "exp": exp},
    settings.jwt_secret_key,
    algorithm=settings.jwt_algorithm,
)

for days in (7, 30, 90, 365):
    r = httpx.get(
        "http://127.0.0.1:8000/api/instagram/insights/dashboard",
        params={"days": days, "top_n": 10},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    body = r.json()
    posts = body.get("top_posts", [])
    print(f"\n=== days={days} -> {len(posts)} top posts ===")
    for p in posts:
        cap = p["caption"][:30].encode("ascii", "replace").decode("ascii")
        print(f"  int={p['interactions']:<6} type={p['media_type']:<14} caption={cap!r}")

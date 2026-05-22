"""One-shot: mint a JWT for an existing user with IG connected, find a
recent eligible post, and POST /api/ai/diagnose-post. Prints the
status + body. Intended for ad-hoc debugging only; safe to delete."""
from __future__ import annotations

import json
import sys

import httpx

sys.path.insert(0, ".")
from app.auth.service import create_access_token  # noqa: E402
from app.database import get_client  # noqa: E402


def main() -> int:
    client = get_client()

    user_rows = client.query(
        "SELECT u.id, u.email FROM users AS u FINAL "
        "INNER JOIN (SELECT user_id FROM instagram_profiles FINAL "
        "            GROUP BY user_id) AS p ON p.user_id = u.id LIMIT 1"
    ).result_rows
    if not user_rows:
        print("No user with IG profile found"); return 1
    user_id, email = str(user_rows[0][0]), user_rows[0][1]
    print(f"user: {email} id={user_id}")

    # Skip the most-recent eligible post — it's cached from prior runs
    # (5-min cache). Use the 3rd one to force a fresh LLM call.
    media_rows = client.query(
        "SELECT ig_media_id, timestamp FROM instagram_media FINAL "
        "WHERE user_id = {uid:UUID} "
        "  AND timestamp <= now() - INTERVAL 24 HOUR "
        "ORDER BY timestamp DESC LIMIT 1 OFFSET 2",
        parameters={"uid": user_id},
    ).result_rows
    if not media_rows:
        print("No eligible media (>24h old) for this user"); return 1
    ig_media_id, ts = media_rows[0]
    print(f"media: {ig_media_id} ts={ts}")

    token = create_access_token({"sub": user_id})

    resp = httpx.post(
        "http://127.0.0.1:8000/api/ai/diagnose-post",
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
        json={"ig_media_id": ig_media_id},
        timeout=180,
    )
    print(f"\nHTTP {resp.status_code}")
    try:
        body = resp.json()
        print(json.dumps(body, indent=2, default=str)[:4000])
    except Exception:
        print(resp.text[:4000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Hit /api/ai/digest/regenerate for the most recent ISO week that
actually has posts, so we exercise the synthesis path (not the
'not_enough_data' empty state). Ad-hoc debug; safe to delete."""
from __future__ import annotations

import json
import sys
from datetime import timedelta

import httpx

sys.path.insert(0, ".")
from app.auth.service import create_access_token  # noqa: E402
from app.database import get_client  # noqa: E402


def main() -> int:
    client = get_client()
    rows = client.query(
        "SELECT u.id FROM users AS u FINAL "
        "INNER JOIN (SELECT user_id FROM instagram_profiles FINAL "
        "            GROUP BY user_id) AS p ON p.user_id = u.id LIMIT 1"
    ).result_rows
    user_id = str(rows[0][0])

    # Pick the Monday of the most-recent week with >=3 posts so the
    # digest has something to synthesize.
    week_rows = client.query(
        "SELECT toMonday(toDate(timestamp)) AS wk, count() AS n "
        "FROM instagram_media FINAL "
        "WHERE user_id = {uid:UUID} "
        "GROUP BY wk HAVING n >= 3 ORDER BY wk DESC LIMIT 1",
        parameters={"uid": user_id},
    ).result_rows
    if not week_rows:
        print("No week with >=3 posts found"); return 1
    week_of, posts = week_rows[0]
    print(f"user_id={user_id}")
    print(f"week_of={week_of}  posts_in_week={posts}")

    token = create_access_token({"sub": user_id})
    resp = httpx.post(
        "http://127.0.0.1:8000/api/ai/digest/regenerate",
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
        json={"week_of": week_of.isoformat()},
        timeout=240,
    )
    print(f"\nHTTP {resp.status_code}")
    try:
        body = resp.json()
        print(json.dumps(body, indent=2, default=str)[:4000])
    except Exception:
        print(resp.text[:2000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

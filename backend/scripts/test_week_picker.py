"""Simulate prev-week clicks on the new picker: walk back N Mondays
and print what GET /api/ai/digest/weekly returns at each step.
Ad-hoc debug; safe to delete."""
from __future__ import annotations

import sys
from datetime import date, timedelta

import httpx

sys.path.insert(0, ".")
from app.auth.service import create_access_token  # noqa: E402
from app.database import get_client  # noqa: E402

STEPS_BACK = 16  # roughly 4 months — enough to land on a week with posts


def main() -> int:
    client = get_client()
    rows = client.query(
        "SELECT u.id FROM users AS u FINAL "
        "INNER JOIN (SELECT user_id FROM instagram_profiles FINAL "
        "            GROUP BY user_id) AS p ON p.user_id = u.id LIMIT 1"
    ).result_rows
    user_id = str(rows[0][0])
    token = create_access_token({"sub": user_id})
    auth = {"Authorization": f"Bearer {token}"}

    today = date.today()
    monday = today - timedelta(days=today.weekday())  # Monday of this week
    print(f"user_id={user_id}  current_monday={monday}\n")
    print(f"{'week_of':<12}  {'status':<16}  {'posts':>5}  {'cached':>6}  has_narrative")
    print("-" * 70)

    for i in range(STEPS_BACK):
        wk = monday - timedelta(days=7 * i)
        resp = httpx.get(
            "http://127.0.0.1:8000/api/ai/digest/weekly",
            headers=auth, params={"week_of": wk.isoformat()}, timeout=30,
        )
        if resp.status_code != 200:
            print(f"{wk.isoformat():<12}  HTTP {resp.status_code}")
            continue
        b = resp.json()
        ms = b.get("metrics_snapshot") or {}
        print(
            f"{wk.isoformat():<12}  {b.get('status',''):<16}  "
            f"{ms.get('posts_count', 0):>5}  {str(b.get('cached', False)):>6}  "
            f"{'yes' if (b.get('narrative_md') or '').strip() else 'no'}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Verify that GET /api/ai/digest/weekly distinguishes a cached
synthesized week (we already synthesized 2022-09-05 earlier) from an
uncached week (current Monday). Confirms the picker's chevron-click
flow surfaces the right state at each step. Ad-hoc; safe to delete."""
from __future__ import annotations

import sys

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
    token = create_access_token({"sub": user_id})
    auth = {"Authorization": f"Bearer {token}"}

    for wk in ("2022-09-05", "2026-05-18"):
        r = httpx.get(
            "http://127.0.0.1:8000/api/ai/digest/weekly",
            headers=auth, params={"week_of": wk}, timeout=15,
        )
        b = r.json()
        nar = (b.get("narrative_md") or "").strip()
        print(f"=== {wk} ===")
        print(f"  status   = {b.get('status')}")
        print(f"  cached   = {b.get('cached')}")
        print(f"  narrative= {len(nar)} chars  "
              f"({'has content' if nar else 'EMPTY'})")
        print(f"  bullets  = {len(b.get('bullets') or [])}")
        ms = b.get("metrics_snapshot") or {}
        print(f"  posts_count={ms.get('posts_count', 0)}  "
              f"reach_pct_delta={ms.get('reach_pct_delta')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

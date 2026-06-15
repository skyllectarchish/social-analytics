"""Publish Instagram's REAL trending-audio list into the trending_audio feed.

⚠️  Uses the UNOFFICIAL private mobile API (see app/instagram/trending_live.py):
ToS violation, account-ban risk, fragile. OFF unless IG_TRENDING_ENABLED=true.

Setup (once):
    cd backend
    pip install instagrapi
    # in .env: IG_TRENDING_ENABLED=true + IG_TRENDING_USERNAME / IG_TRENDING_PASSWORD
    #          (use a throwaway account — NOT your main one)

Run (manually, or via cron / Task Scheduler — do NOT wire into the API process):
    py scripts/refresh_ig_trending.py

It logs in (first login may hit an email/SMS challenge you must resolve), pulls
the in-app trending list, and writes it under the current week so the existing
GET /api/instagram/trending-audio endpoint and the dashboard panel serve it with
no further changes. Re-running overwrites the week in place.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_client  # noqa: E402
from app.instagram import trending_live  # noqa: E402
from app.repositories import trending_audio_repo  # noqa: E402


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def main() -> int:
    try:
        items = trending_live.fetch_trending(limit=25)
    except trending_live.TrendingDisabledError as exc:
        print(f"Disabled/unconfigured: {exc}")
        return 0

    if not items:
        print("No trending items parsed — check the raw-shape log line and adjust "
              "_extract_item in app/instagram/trending_live.py.")
        return 0

    week = _monday(datetime.now(timezone.utc).date())
    n = trending_audio_repo.replace_week(get_client(), week, items)
    print(f"Published {n} LIVE trending-audio items for week of {week.isoformat()}")
    for it in items[:5]:
        print(f"  - {it['title']}" + (f" / {it['artist']}" if it['artist'] else ""))
    return n


if __name__ == "__main__":
    main()

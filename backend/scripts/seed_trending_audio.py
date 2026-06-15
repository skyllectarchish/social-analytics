"""Publish a week's editorial trending-audio feed.

The Instagram Graph API exposes no trending-audio data, so this list is curated
by hand from public weekly roundups (Buffer, Later, HeyOrca, freebeat) and
refreshed manually. Each week, update the AUDIO list below (and SOURCE) and run:

    cd backend
    py scripts/seed_trending_audio.py

It publishes under the current ISO week (Monday); the GET /instagram/trending-audio
endpoint always serves the most recent week. Re-running the same week overwrites
it in place (ReplacingMergeTree on (week, rank)).
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_client  # noqa: E402
from app.repositories import trending_audio_repo  # noqa: E402

SOURCE = "Buffer — Trending Instagram Sounds (June 2026)"

# Curated from the public roundup. `reels_count`/`delta` are optional display
# strings; fill them in if the source quotes figures, otherwise leave blank.
AUDIO = [
    {"title": "hate that i made you love me", "artist": "Ariana Grande",
     "use_case": "Breakup & situationship edits", "source": SOURCE},
    {"title": "Okayyy", "artist": "Latto ft. Doja Cat",
     "use_case": "Fashion & food content", "source": SOURCE},
    {"title": "Real One's Never Break", "artist": "Marco Cartwright",
     "use_case": "Gym & motivation", "source": SOURCE},
    {"title": "Game Time", "artist": "Future & Tyla",
     "use_case": "Sports & travel (World Cup 2026)", "source": SOURCE},
    {"title": "SPEND DAT SAX", "artist": "Corey Staggers",
     "use_case": "Product reveals & recipes", "source": SOURCE},
    {"title": "Wings (sped-up nightcore)", "artist": "Birdy",
     "use_case": "Graduation & emotional text overlays", "source": SOURCE},
]


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def main() -> int:
    client = get_client()
    week = _monday(datetime.now(timezone.utc).date())
    n = trending_audio_repo.replace_week(client, week, AUDIO)
    print(f"Published {n} trending-audio items for week of {week.isoformat()}")
    return n


if __name__ == "__main__":
    main()

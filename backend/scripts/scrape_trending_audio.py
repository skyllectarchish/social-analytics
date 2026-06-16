"""Automated roundup scraper for the editorial trending-audio feed.

Fetches a public "trending Instagram audio" roundup page, uses the project's
LLM (`app.ai.client.synthesize`) to extract a structured song list, and
publishes it under the current ISO week via `trending_audio_repo` — the same
table `seed_trending_audio.py` writes and `GET /instagram/trending-audio`
serves. This replaces hand-editing the seed list each week.

It scrapes a PUBLIC roundup article (NOT Instagram's private API), so there is
no account / ban risk. Honest caveat: this is editorial data — what a publisher
reports as trending — not Instagram's own live leaderboard, and not personalized.

IMPORTANT: run with the project venv (the LLM client needs the `ollama` package
and OLLAMA_API_KEY, the same as the API's AI features):

    cd backend
    venv/Scripts/python scripts/scrape_trending_audio.py
    venv/Scripts/python scripts/scrape_trending_audio.py --dry-run
    venv/Scripts/python scripts/scrape_trending_audio.py --url <other-roundup-url>

Schedule it weekly via Windows Task Scheduler (do NOT wire it into the API
process). LLM extraction is robust to layout changes; if a site starts blocking
the fetch it fails soft (publishes nothing, leaving the prior week intact).
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Roundup song titles contain non-ASCII (em dashes, accents); keep prints from
# crashing on a legacy Windows console code page.
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:  # noqa: BLE001
    pass

from app.ai import client as ai_client  # noqa: E402
from app.database import get_client  # noqa: E402
from app.repositories import trending_audio_repo  # noqa: E402

DEFAULT_URL = "https://buffer.com/resources/trending-audio-instagram/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# We ask for a pipe-delimited list rather than JSON: the gpt-oss model ignores
# Ollama's json_schema `format` constraint and reliably emits this shape, so we
# lean into it and parse deterministically (see _parse_lines).
SYSTEM = (
    "You extract trending Instagram audio from a roundup article. List ONLY "
    "songs the article presents as currently trending on Instagram, in the "
    "article's order, ONE PER LINE, in exactly this pipe-delimited format:\n"
    "title | artist | use_case\n"
    "Rules: leave 'artist' empty (nothing between the pipes) for original/none; "
    "'use_case' is a SHORT phrase (<=60 chars) for what creators use it for, "
    "drawn from the article. Output ONLY these lines — no numbering, no header, "
    "no commentary. Never invent songs that are not in the article."
)


def _parse_lines(raw: str) -> list[dict]:
    """Parse the model's `title | artist | use_case` lines into song dicts,
    tolerating stray numbering/bullets and missing trailing fields."""
    songs: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        title = re.sub(r"^\s*(\d+[.\)]|[-*•])\s*", "", parts[0]).strip()
        if not title:
            continue
        songs.append({
            "title": title,
            "artist": parts[1] if len(parts) > 1 else "",
            "use_case": parts[2] if len(parts) > 2 else "",
        })
    return songs


def _fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as r:  # noqa: S310 (fixed http(s) roundup URL)
        charset = r.headers.get_content_charset() or "utf-8"
        return r.read().decode(charset, "replace")


def _html_to_text(html: str) -> str:
    """Crude tag-strip — good enough; the LLM tolerates noisy text. Capped so a
    huge page can't blow the context window."""
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:24000]


async def _extract(text: str) -> list[dict]:
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_CONTENT_FACTORY,
        system=SYSTEM,
        messages=[{"role": "user", "content": "Article text:\n\n" + text}],
        max_tokens=2048,
    )
    return _parse_lines(result.text or "")


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default=DEFAULT_URL, help="Roundup URL to scrape.")
    ap.add_argument("--limit", type=int, default=12, help="Max songs to publish.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be published without writing.")
    args = ap.parse_args()

    print(f"Fetching {args.url} ...")
    try:
        html = _fetch(args.url)
    except Exception as exc:  # noqa: BLE001 — fail soft, keep prior week
        print(f"Fetch failed ({exc}); nothing published.")
        return 0
    text = _html_to_text(html)
    if len(text) < 200:
        print("Page text too short — site likely blocked the request or changed.")
        return 0

    try:
        songs = asyncio.run(_extract(text))
    except Exception as exc:  # noqa: BLE001
        print(f"LLM extraction failed ({exc}); nothing published.")
        return 0

    host = re.sub(r"^https?://(www\.)?", "", args.url).split("/")[0]
    month = datetime.now(timezone.utc).strftime("%b %Y")
    source = f"{host} (scraped {month})"

    items: list[dict] = []
    for s in songs[: args.limit]:
        title = (s.get("title") or "").strip()
        if not title:
            continue
        items.append({
            "title": title,
            "artist": (s.get("artist") or "").strip(),
            "use_case": (s.get("use_case") or "").strip(),
            "source": source,
        })

    if not items:
        print("No songs extracted — nothing published (prior week left intact).")
        return 0

    print(f"Extracted {len(items)} songs:")
    for it in items:
        print(f"  - {it['title']}" + (f" / {it['artist']}" if it["artist"] else ""))

    if args.dry_run:
        print("(dry run — not published)")
        return len(items)

    week = _monday(datetime.now(timezone.utc).date())
    n = trending_audio_repo.replace_week(get_client(), week, items)
    print(f"Published {n} scraped trending-audio items for week of {week.isoformat()}")
    return n


if __name__ == "__main__":
    main()

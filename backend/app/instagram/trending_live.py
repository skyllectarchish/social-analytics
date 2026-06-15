"""Instagram trending audio via the PRIVATE (unofficial) mobile API.

⚠️  READ THIS. This module does NOT use Meta's official Graph API. It logs in
as a real Instagram account through `instagrapi` and calls the reverse-engineered
endpoint `/api/v1/music/trending/` — the same feed that powers the in-app
"Trending" audio leaderboard. Consequences you are accepting by enabling it:

  * It VIOLATES Instagram's Terms of Service (automated access impersonating
    the mobile app).
  * The account used can be CHALLENGED (email/SMS 2FA) on first login and
    BANNED at any time. Use a throwaway/dedicated account, never your main one.
  * It is FRAGILE — Instagram changes these private endpoints without notice,
    which will break this without warning.

It is OFF by default (IG_TRENDING_ENABLED=false) and never runs as part of the
API process; it only executes when you explicitly run scripts/refresh_ig_trending.py.

NOTE: the exact JSON shape of /music/trending/ is not public, so `_extract_item`
is a best-effort, tolerant parser. The first run logs the raw item keys at INFO
— adjust the candidate field paths below to match what your account actually
returns.
"""

from __future__ import annotations

import logging
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)


class TrendingDisabledError(RuntimeError):
    """Raised when the feature is off or unconfigured."""


def _client():
    """Build a logged-in instagrapi client, reusing a cached session when possible."""
    if not settings.ig_trending_enabled:
        raise TrendingDisabledError(
            "IG_TRENDING_ENABLED is false. This uses the unofficial private API "
            "(ToS violation, ban risk) — enable it deliberately in .env."
        )
    if not settings.ig_trending_username or not settings.ig_trending_password:
        raise TrendingDisabledError("IG_TRENDING_USERNAME / IG_TRENDING_PASSWORD not set in .env.")

    try:
        from instagrapi import Client  # lazy: app starts without instagrapi installed
    except ImportError as exc:
        raise TrendingDisabledError(
            "instagrapi is not installed. `pip install instagrapi` (it's an optional dep)."
        ) from exc

    cl = Client()
    session_path = settings.ig_trending_session_path
    try:
        cl.load_settings(session_path)
        cl.login(settings.ig_trending_username, settings.ig_trending_password)
        cl.get_timeline_feed()  # cheap call to confirm the cached session is still valid
    except Exception:
        # No/invalid cached session — do a fresh login. This is the step most
        # likely to hit a challenge (email/SMS); instagrapi will raise and the
        # operator must resolve it interactively.
        logger.warning("trending_live: cached session unusable, doing a fresh login")
        cl = Client()
        cl.login(settings.ig_trending_username, settings.ig_trending_password)
        try:
            cl.dump_settings(session_path)
        except Exception:
            logger.warning("trending_live: could not persist session to %s", session_path)
    return cl


def _first(d: dict[str, Any], keys: tuple[str, ...]) -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _extract_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Best-effort map one /music/trending/ item → our trending_audio shape.

    The endpoint nests the music asset differently across app versions, so we
    probe several candidate containers and field names. Tweak as needed once
    you see a real response (logged on first run)."""
    if not isinstance(raw, dict):
        return None
    # Candidate containers that might hold the music asset fields.
    candidates: list[dict[str, Any]] = [raw]
    for path in ("track", "music", "music_asset_info"):
        v = raw.get(path)
        if isinstance(v, dict):
            candidates.append(v)
    meta = raw.get("metadata")
    if isinstance(meta, dict):
        mi = meta.get("music_info") or {}
        if isinstance(mi, dict):
            mai = mi.get("music_asset_info")
            if isinstance(mai, dict):
                candidates.append(mai)

    title = artist = ""
    for c in candidates:
        title = title or _first(c, ("title", "track_title", "song_name"))
        artist = artist or _first(c, ("display_artist", "artist", "ig_artist", "subtitle"))
    if not title:
        return None
    return {
        "title": title[:300],
        "artist": artist[:200],
        "reels_count": "",   # the trending feed rarely includes counts; left blank
        "delta": "",
        "use_case": "",
        "source": "Instagram trending (private API)",
    }


def fetch_trending(limit: int = 25) -> list[dict[str, Any]]:
    """Fetch the current in-app trending-audio list. Raises TrendingDisabledError
    if not enabled/configured; other exceptions propagate (login challenge, etc.)."""
    cl = _client()
    cl.private_request("music/trending/", data={})  # POST; signed body adds _uuid/_csrftoken
    payload = cl.last_json or {}
    items = payload.get("items") or []
    logger.info(
        "trending_live: /music/trending/ returned %d items; top-level keys=%s; "
        "first item keys=%s",
        len(items),
        list(payload.keys()),
        list(items[0].keys()) if items and isinstance(items[0], dict) else None,
    )
    out: list[dict[str, Any]] = []
    for raw in items:
        parsed = _extract_item(raw)
        if parsed:
            out.append(parsed)
        if len(out) >= limit:
            break
    return out

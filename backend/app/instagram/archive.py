"""Instagram data-export ("Download your information") parser.

Users request their export at Accounts Center → Your information and
permissions → Download your information (format: JSON). The resulting ZIP
contains JSON files whose paths vary by export version, so files are
classified by *shape*, not path:

* posts    — list of {media: [{creation_timestamp, title}], ...}
             (content/posts_1.json)
* stories  — {"ig_stories": [{creation_timestamp, title}]}
             (content/stories.json)
* followers — list of {string_list_data: [{value, timestamp}]} or
             {"relationships_followers": [...]}
             (connections/followers_and_following/followers_1.json)

Quirk: Meta writes these files with UTF-8 byte sequences escaped as if they
were latin-1 (mojibake) — "café" arrives as "cafÃ©". `fix_mojibake`
reverses that; it's a no-op for plain-ASCII strings.
"""

from __future__ import annotations

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

#: Per-JSON-file size cap inside the ZIP — the data files are small; anything
#: bigger is media or messages and gets skipped without being read.
MAX_JSON_BYTES = 50 * 1024 * 1024


def fix_mojibake(s: str) -> str:
    """Reverse Meta's latin-1-escaped UTF-8. Safe no-op for ASCII."""
    if not s:
        return ""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _ts_to_dt(ts: Any) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


# --- Shape classifiers ----------------------------------------------------

def _parse_posts(payload: Any) -> list[dict[str, Any]]:
    """content/posts_*.json → [{taken_at, caption, media_count}]"""
    if isinstance(payload, dict):
        # Some export versions wrap posts: {"ig_posts": [...]} (rare).
        payload = payload.get("ig_posts") or payload.get("posts") or []
    if not isinstance(payload, list):
        return []

    out: list[dict[str, Any]] = []
    for entry in payload:
        if not isinstance(entry, dict) or "media" not in entry:
            continue
        media = entry.get("media") or []
        if not isinstance(media, list) or not media:
            continue
        # Carousel: entry-level timestamp/title; single: on the media item.
        ts = entry.get("creation_timestamp") or (media[0] or {}).get("creation_timestamp")
        taken_at = _ts_to_dt(ts)
        if taken_at is None:
            continue
        caption = entry.get("title") or (media[0] or {}).get("title") or ""
        out.append({
            "taken_at": taken_at,
            "caption": fix_mojibake(str(caption))[:2200],
            "media_count": len(media),
        })
    return out


def _parse_stories(payload: Any) -> list[dict[str, Any]]:
    """content/stories.json → [{taken_at, caption}]"""
    if not isinstance(payload, dict) or "ig_stories" not in payload:
        return []
    out: list[dict[str, Any]] = []
    for entry in payload.get("ig_stories") or []:
        if not isinstance(entry, dict):
            continue
        taken_at = _ts_to_dt(entry.get("creation_timestamp"))
        if taken_at is None:
            continue
        out.append({
            "taken_at": taken_at,
            "caption": fix_mojibake(str(entry.get("title") or ""))[:2200],
        })
    return out


def _parse_followers(payload: Any) -> list[dict[str, Any]]:
    """connections/.../followers_*.json → [{follower_username, followed_at}]"""
    if isinstance(payload, dict):
        payload = payload.get("relationships_followers") or []
    if not isinstance(payload, list):
        return []

    out: list[dict[str, Any]] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        for item in entry.get("string_list_data") or []:
            if not isinstance(item, dict):
                continue
            username = fix_mojibake(str(item.get("value") or "")).strip()
            followed_at = _ts_to_dt(item.get("timestamp"))
            if not username or followed_at is None:
                continue
            out.append({"follower_username": username[:256], "followed_at": followed_at})
    return out


# --- Entry points ----------------------------------------------------------

def classify_and_parse(raw: bytes) -> tuple[str, list[dict[str, Any]]]:
    """Parse one JSON file and classify it by shape.

    Returns (kind, rows) where kind is 'posts' | 'stories' | 'followers' |
    'unknown'. Never raises on malformed content — returns ('unknown', []).
    """
    try:
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except (ValueError, UnicodeDecodeError):
        return "unknown", []

    stories = _parse_stories(payload)
    if stories:
        return "stories", stories
    followers = _parse_followers(payload)
    if followers:
        return "followers", followers
    posts = _parse_posts(payload)
    if posts:
        return "posts", posts
    return "unknown", []


def extract_from_zip(blob: bytes) -> dict[str, list[dict[str, Any]]]:
    """Walk a ZIP export, parse every plausible JSON file, merge by kind.

    Media files (the bulk of the archive) are skipped by extension and the
    per-file size cap, so even multi-GB exports only have their JSON read.
    """
    results: dict[str, list[dict[str, Any]]] = {"posts": [], "stories": [], "followers": []}
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        for info in zf.infolist():
            name = info.filename
            if not name.lower().endswith(".json") or info.file_size > MAX_JSON_BYTES:
                continue
            # Skip obviously irrelevant trees to keep big exports fast.
            lowered = name.lower()
            if any(seg in lowered for seg in ("/messages/", "ads_information", "logged_information", "security_and_login")):
                continue
            try:
                raw = zf.read(info)
            except (zipfile.BadZipFile, OSError):
                continue
            kind, rows = classify_and_parse(raw)
            if kind in results and rows:
                logger.info("archive import: %s → %d %s rows", name, len(rows), kind)
                results[kind].extend(rows)
    return results


def extract(filename: str, blob: bytes) -> dict[str, list[dict[str, Any]]]:
    """Parse one uploaded file — ZIP or single JSON — into kind-keyed rows."""
    if filename.lower().endswith(".zip") or blob[:2] == b"PK":
        return extract_from_zip(blob)
    kind, rows = classify_and_parse(blob)
    out: dict[str, list[dict[str, Any]]] = {"posts": [], "stories": [], "followers": []}
    if kind in out:
        out[kind] = rows
    return out

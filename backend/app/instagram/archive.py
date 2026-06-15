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


def _parse_stories(payload: Any, *, require_key: bool = True) -> list[dict[str, Any]]:
    """content/stories.json → [{taken_at, caption}].

    Instagram has shipped two shapes across export versions: a flat one
    ({"ig_stories": [{creation_timestamp, title}]}) and a post-style one
    where each entry wraps a `media` list (identical to posts_*.json). Both
    are handled here.

    ``require_key=True`` (the shape-detection fallback) only accepts the
    dict-with-``ig_stories`` form: a bare top-level list is indistinguishable
    from posts_*.json, so we trust it only when the *filename* already told us
    this is the stories file (``require_key=False``).
    """
    if isinstance(payload, dict):
        inner = payload.get("ig_stories")
        if inner is None:
            inner = payload.get("stories")
        if inner is None:
            return []
        payload = inner
    elif require_key:
        return []

    if not isinstance(payload, list):
        return []

    out: list[dict[str, Any]] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        # Flat entry, or post-style {media: [{creation_timestamp, title}]}.
        media = entry.get("media")
        if isinstance(media, list) and media:
            first = media[0] or {}
            ts = entry.get("creation_timestamp") or first.get("creation_timestamp")
            caption = entry.get("title") or first.get("title") or ""
        else:
            ts = entry.get("creation_timestamp")
            caption = entry.get("title") or ""
        taken_at = _ts_to_dt(ts)
        if taken_at is None:
            continue
        out.append({
            "taken_at": taken_at,
            "caption": fix_mojibake(str(caption))[:2200],
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

def classify_and_parse(raw: bytes, filename: str = "") -> tuple[str, list[dict[str, Any]]]:
    """Parse one JSON file and classify it.

    Returns (kind, rows) where kind is 'posts' | 'stories' | 'followers' |
    'unknown'. Never raises on malformed content — returns ('unknown', []).

    The filename is the primary signal when available: stories_*.json and
    posts_*.json share an identical shape, so shape detection alone routes
    post-shaped stories into 'posts'. When the filename is unhelpful we fall
    back to shape detection (stricter, to avoid that same collision).
    """
    try:
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except (ValueError, UnicodeDecodeError):
        return "unknown", []

    lowered = filename.lower()
    if "stories" in lowered or "story" in lowered:
        rows = _parse_stories(payload, require_key=False)
        if rows:
            return "stories", rows
    elif "followers" in lowered:
        rows = _parse_followers(payload)
        if rows:
            return "followers", rows
    elif "posts" in lowered:
        rows = _parse_posts(payload)
        if rows:
            return "posts", rows

    # Filename gave no usable hint (or didn't match its expected shape) —
    # fall back to shape detection. _parse_stories requires the ig_stories
    # key here so a bare posts list isn't misread as stories.
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


def _extract_zip(blob: bytes) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Walk a ZIP export, parse every plausible JSON file, merge by kind.

    Returns (results, diag). ``diag`` records every eligible JSON file and how
    it was classified — including files that yielded 0 rows or 'unknown' — so
    a caller can surface *why* a kind came back empty (e.g. a stories file
    being read but routed to 'posts').

    Media files (the bulk of the archive) are skipped by extension and the
    per-file size cap, so even multi-GB exports only have their JSON read.
    """
    results: dict[str, list[dict[str, Any]]] = {"posts": [], "stories": [], "followers": []}
    diag: list[dict[str, Any]] = []
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
            kind, rows = classify_and_parse(raw, name)
            logger.info("archive import: %s → %d %s rows", name, len(rows), kind)
            if len(diag) < 100:
                diag.append({"file": name.rsplit("/", 1)[-1], "kind": kind, "rows": len(rows)})
            if kind in results and rows:
                results[kind].extend(rows)
    return results, diag


def extract_from_zip(blob: bytes) -> dict[str, list[dict[str, Any]]]:
    """Back-compat wrapper: kind-keyed rows only (drops the per-file diag)."""
    results, _ = _extract_zip(blob)
    return results


def extract_verbose(
    filename: str, blob: bytes,
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Like ``extract`` but also returns per-file classification diagnostics."""
    if filename.lower().endswith(".zip") or blob[:2] == b"PK":
        return _extract_zip(blob)
    kind, rows = classify_and_parse(blob, filename)
    out: dict[str, list[dict[str, Any]]] = {"posts": [], "stories": [], "followers": []}
    if kind in out:
        out[kind] = rows
    diag = [{"file": filename.rsplit("/", 1)[-1] or filename, "kind": kind, "rows": len(rows)}]
    return out, diag


def extract(filename: str, blob: bytes) -> dict[str, list[dict[str, Any]]]:
    """Parse one uploaded file — ZIP or single JSON — into kind-keyed rows."""
    results, _ = extract_verbose(filename, blob)
    return results

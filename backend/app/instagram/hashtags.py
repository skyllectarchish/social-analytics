"""Caption hashtag extraction (Tier 2 / F2).

Pure utility — no I/O. Called from `instagram_repo.bulk_insert_media` at sync
time and from the one-off backfill script.
"""

from __future__ import annotations

import re

# Allows ASCII alphanumerics, underscore, and the full BMP letter range so that
# multilingual hashtags (Hindi, Spanish, Korean…) survive extraction. Does NOT
# match `@mentions`. Special chars like `+` or `-` are excluded to mirror
# Instagram's own hashtag rendering rules.
_HASHTAG_RE = re.compile(r"#([A-Za-z0-9_À-￿]+)")


def extract_hashtags(caption: str | None) -> list[tuple[str, int]]:
    """Return ``[(hashtag_lowercase, char_position), ...]`` for a caption."""
    if not caption:
        return []
    return [(m.group(1).lower(), m.start()) for m in _HASHTAG_RE.finditer(caption)]

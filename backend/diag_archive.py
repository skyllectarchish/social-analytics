"""One-shot diagnostic for archive import.

Usage:
    py diag_archive.py "C:\\path\\to\\your-instagram-export.zip"
    py diag_archive.py "C:\\path\\to\\stories.json"

Prints, for every JSON file it would look at, the filename, top-level shape,
and how archive.classify_and_parse routes it — without touching the database.
This shows exactly why stories may be landing in 'posts' (or nowhere).
"""

from __future__ import annotations

import io
import json
import sys
import zipfile

from app.instagram import archive


def describe(payload) -> str:
    if isinstance(payload, dict):
        keys = list(payload.keys())
        head = keys[:6]
        # If a known wrapper, peek at the first entry's keys too.
        for k in ("ig_stories", "stories", "ig_posts", "posts", "relationships_followers"):
            v = payload.get(k)
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return f"dict keys={head} ; {k}[0] keys={list(v[0].keys())[:8]}"
        return f"dict keys={head}"
    if isinstance(payload, list):
        first = payload[0] if payload else None
        if isinstance(first, dict):
            return f"list(len={len(payload)}) ; [0] keys={list(first.keys())[:8]}"
        return f"list(len={len(payload)}) ; [0]={type(first).__name__}"
    return type(payload).__name__


def report(name: str, raw: bytes) -> None:
    try:
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001
        print(f"  {name}: NOT JSON ({exc})")
        return
    kind, rows = archive.classify_and_parse(raw, name)
    print(f"  {name}")
    print(f"      shape : {describe(payload)}")
    print(f"      -> classified as {kind!r}, {len(rows)} rows", end="")
    if rows:
        print(f" (sample: {rows[0]})")
    else:
        print()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    with open(path, "rb") as fh:
        blob = fh.read()

    if path.lower().endswith(".zip") or blob[:2] == b"PK":
        print(f"ZIP: {path}\nJSON files considered:")
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            any_seen = False
            for info in zf.infolist():
                nm = info.filename
                low = nm.lower()
                if not low.endswith(".json") or info.file_size > archive.MAX_JSON_BYTES:
                    continue
                if any(seg in low for seg in ("/messages/", "ads_information", "logged_information", "security_and_login")):
                    print(f"  {nm}: SKIPPED (excluded path)")
                    continue
                any_seen = True
                report(nm, zf.read(info))
            if not any_seen:
                print("  (no eligible .json files found in the ZIP)")
        # Also show the merged totals the importer would compute.
        merged = archive.extract_from_zip(blob)
        print("\nMerged totals importer would store:")
        for k, v in merged.items():
            print(f"  {k}: {len(v)}")
    else:
        print(f"Single file: {path}")
        report(path, blob)


if __name__ == "__main__":
    main()

"""AI-annotated retention curve analysis. Runs as a BackgroundTask — never raises."""

import logging
import re

from ..database import get_client
from ..repositories import youtube_repo
from . import client as ai_client
from . import quota

logger = logging.getLogger(__name__)

_DROP_THRESHOLD_PCT = 8.0
_CLIFF_WINDOW_POINTS = 10
_MAX_CLIFFS = 5
_MIN_VIEWS_FOR_AI = 1000


def _parse_vtt(vtt_text: str) -> list[tuple[float, float, str]]:
    segments = []
    lines = vtt_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if "-->" in line:
            try:
                start_str, end_str = line.split("-->")
                start_s = _vtt_ts_to_sec(start_str.strip())
                end_s = _vtt_ts_to_sec(end_str.strip())
                i += 1
                text_parts = []
                while i < len(lines) and lines[i].strip():
                    text_parts.append(re.sub(r"<[^>]+>", "", lines[i].strip()))
                    i += 1
                if text_parts:
                    segments.append((start_s, end_s, " ".join(text_parts)))
            except (ValueError, IndexError):
                i += 1
        else:
            i += 1
    return segments


def _vtt_ts_to_sec(ts: str) -> float:
    ts = ts.split(".")[0]
    parts = ts.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return float(ts)


def _extract_window(segments: list[tuple[float, float, str]], center: float, window: float = 30.0) -> str:
    return " ".join(
        text for start, end, text in segments
        if start >= center - window and end <= center + window
    )


def _detect_cliffs(curve: list[dict]) -> list[dict]:
    n = len(curve)
    candidates = []
    for i in range(n - _CLIFF_WINDOW_POINTS):
        drop = (curve[i]["audience_watch_ratio"] - curve[i + _CLIFF_WINDOW_POINTS]["audience_watch_ratio"]) * 100
        if drop >= _DROP_THRESHOLD_PCT:
            candidates.append({"elapsed_ratio": curve[i]["elapsed_video_time_ratio"], "drop_pct": drop})
    candidates.sort(key=lambda c: -c["drop_pct"])
    seen, result = set(), []
    for c in candidates:
        bucket = int(c["elapsed_ratio"] * 20)
        if bucket not in seen:
            seen.add(bucket)
            result.append(c)
        if len(result) >= _MAX_CLIFFS:
            break
    return sorted(result, key=lambda c: c["elapsed_ratio"])


async def analyze_retention(
    user_id: str,
    video_id: str,
    video_title: str,
    duration_seconds: int,
    caption_text: str | None,
) -> None:
    client = get_client()
    try:
        if youtube_repo.annotations_are_fresh(client, user_id, video_id):
            return

        curve = youtube_repo.find_retention_curve(client, user_id, video_id)
        if not curve:
            return

        cliffs = _detect_cliffs(curve)
        if not cliffs:
            return

        segments = _parse_vtt(caption_text) if caption_text else []
        annotations = []
        model = ai_client._model_for_feature()

        for cliff in cliffs:
            timestamp_s = int(cliff["elapsed_ratio"] * max(duration_seconds, 1))
            mm, ss = timestamp_s // 60, timestamp_s % 60
            drop_pct = cliff["drop_pct"]

            excerpt = _extract_window(segments, timestamp_s) if segments else ""
            if excerpt:
                prompt = (
                    f'You are a YouTube retention analyst.\n'
                    f'At {mm}:{ss:02d} in "{video_title}", {drop_pct:.1f}% of viewers '
                    f'left within 10 seconds.\nTranscript:\n---\n{excerpt}\n---\n'
                    f'In 1-2 sentences: why did viewers likely leave, and one actionable fix.'
                )
            else:
                prompt = (
                    f'You are a YouTube retention analyst.\n'
                    f'At {mm}:{ss:02d} in "{video_title}", {drop_pct:.1f}% of viewers '
                    f'left within 10 seconds. No transcript available.\n'
                    f'Suggest one likely reason and one fix based only on the timing.'
                )

            try:
                result = await ai_client.synthesize(
                    model=model,
                    system=None,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=150,
                )
                quota.record_call(client, user_id=user_id, feature="retention_annotation", result=result)
                annotation_text = result.text.strip()
            except Exception as exc:
                logger.warning("retention_analyzer: LLM failed for %s@%ds: %s", video_id, timestamp_s, exc)
                annotation_text = "AI analysis unavailable for this drop-off."

            annotations.append({
                "timestamp_seconds": timestamp_s,
                "annotation_text": annotation_text,
                "drop_pct": drop_pct,
                "model": model,
            })

        youtube_repo.bulk_insert_retention_annotations(client, user_id, video_id, annotations)
        logger.info("retention_analyzer: stored %d annotations for %s", len(annotations), video_id)
    except Exception:
        logger.exception("retention_analyzer: unexpected failure for video %s", video_id)

"""Tier 2 / F4 — weekly topic clustering on the comment corpus.

The full pipeline (Voyage/OpenAI embeddings → KMeans → Claude label) is
expensive to wire in for a first cut. This module ships a deliberately simple
v0: bag-of-words TF-IDF + KMeans inside scikit-learn, then a Claude Haiku
label per cluster. Replace `_vectorise` with embedding-based vectors once the
embeddings job lands.

Usage:
    cd backend
    python -m app.jobs.topic_clustering
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import settings
from ..database import get_client
from ..repositories.comment_repo import replace_topics_for_user

logger = logging.getLogger(__name__)

MIN_COMMENTS_TO_CLUSTER = 50
DEFAULT_LOOKBACK_DAYS = 90


def _vectorise(texts: list[str]):
    """TF-IDF vectoriser. Returns a sparse matrix."""
    from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore

    vec = TfidfVectorizer(
        max_features=2000,
        stop_words="english",
        ngram_range=(1, 2),
        min_df=2,
    )
    return vec.fit_transform(texts)


def _cluster(matrix, k: int):
    from sklearn.cluster import KMeans  # type: ignore

    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    return km.fit_predict(matrix)


def _label_cluster(sample_texts: list[str]) -> str:
    """Ask Claude Haiku for a 1–4 word label from 5 representative comments."""
    try:
        from anthropic import Anthropic  # type: ignore
    except ImportError:
        return "topic"
    api_key = getattr(settings, "anthropic_api_key", None)
    if not api_key:
        return "topic"

    snippet = "\n".join(f"- {t[:200]}" for t in sample_texts[:5])
    try:
        resp = Anthropic(api_key=api_key).messages.create(
            model="claude-haiku-4-5",
            max_tokens=24,
            system=(
                "Summarise the common topic of these Instagram comments in 4 "
                "words or fewer. Output only the label, no quotes."
            ),
            messages=[{"role": "user", "content": snippet}],
        )
        return (resp.content[0].text if resp.content else "topic").strip()[:80]
    except Exception as exc:
        logger.warning("Haiku label call failed: %s", exc)
        return "topic"


#: A cluster is tagged is_question=True when at least this fraction of its
#: member comments are flagged is_question=1 in comment_sentiment. Threshold
#: chosen to require a clear majority rather than a single questioning comment
#: tilting a topic — e.g., a "morning routine" cluster with one stray "what
#: time do you wake up?" shouldn't become a question topic.
QUESTION_CLUSTER_THRESHOLD: float = 0.5


def cluster_for_user(
    user_id: str,
    since: datetime,
    until: datetime,
) -> list[dict[str, Any]]:
    """Compute and persist topic clusters for one user over [since, until]."""
    client = get_client()
    rows = client.query(
        """
        SELECT c.ig_comment_id, c.text, s.is_question
        FROM comment_sentiment s FINAL
        INNER JOIN instagram_comments c FINAL
            ON s.ig_comment_id = c.ig_comment_id AND s.user_id = c.user_id
        WHERE s.user_id = {user_id:UUID}
          AND s.is_spam = 0
          AND c.timestamp BETWEEN {since:DateTime} AND {until:DateTime}
        LIMIT 5000
        """,
        parameters={"user_id": user_id, "since": since, "until": until},
    ).result_rows
    if len(rows) < MIN_COMMENTS_TO_CLUSTER:
        logger.info(
            "topic_clustering: user %s has %d comments (< %d) — skipping",
            user_id, len(rows), MIN_COMMENTS_TO_CLUSTER,
        )
        return []

    texts = [r[1] or "" for r in rows]
    comment_ids = [r[0] for r in rows]
    is_question_flags = [bool(r[2]) for r in rows]
    matrix = _vectorise(texts)
    k = min(12, max(4, len(rows) // 60))
    labels = _cluster(matrix, k)

    clusters: list[dict[str, Any]] = []
    for cluster_id in range(k):
        member_idx = [i for i, lab in enumerate(labels) if lab == cluster_id]
        if not member_idx:
            continue
        sample_idx = member_idx[:5]
        sample_texts = [texts[i] for i in sample_idx]
        sample_ids = [comment_ids[i] for i in sample_idx]
        # Fraction of question-comments across the WHOLE cluster (not just
        # the 5-comment sample) so the flag reflects the cluster, not the
        # picked representatives.
        question_count = sum(1 for i in member_idx if is_question_flags[i])
        is_question = (question_count / len(member_idx)) >= QUESTION_CLUSTER_THRESHOLD
        clusters.append({
            "cluster_id": int(cluster_id),
            "label": _label_cluster(sample_texts),
            "sample_comment_ids": sample_ids,
            "size": len(member_idx),
            "is_question": is_question,
        })

    replace_topics_for_user(client, user_id, since, until, clusters)
    return clusters


def main(lookback_days: int = DEFAULT_LOOKBACK_DAYS) -> int:
    """Cluster comments for every user with sentiment data in the window."""
    client = get_client()
    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=lookback_days)
    user_rows = client.query(
        "SELECT DISTINCT user_id FROM comment_sentiment FINAL "
        "WHERE is_spam = 0",
    ).result_rows
    total = 0
    for (user_id,) in user_rows:
        clusters = cluster_for_user(str(user_id), since, until)
        total += len(clusters)
        logger.info("topic_clustering: user %s -> %d clusters", user_id, len(clusters))
    return total


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()

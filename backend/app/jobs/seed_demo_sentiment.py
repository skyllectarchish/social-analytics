"""Synthetic Audience-Voice seed (Tier 2 / F4 fallback).

When Meta's API silently strips comment data (commonly because the app
hasn't been approved for Advanced Access on `instagram_business_manage_comments`),
the Audience Voice section sits empty. This module generates plausible
synthetic comments + sentiment + topics so users can see the section work
end-to-end while they sort out Meta App Review.

Every row is tagged so it can be cleaned out:
* `instagram_comments.ig_comment_id` starts with `synth_`
* `comment_sentiment.model` is `synthetic_v1`
* `comment_topics.cluster_id >= 9000`

The existing `/api/instagram/purge?synth_only=true` endpoint already knows
these markers and can wipe demo data without touching real synced rows.
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

from ..database import get_client
from ..repositories import comment_repo, instagram_repo
from ..repositories.safe_query import safe_call

logger = logging.getLogger(__name__)

SYNTH_MODEL = "synthetic_v1"
SYNTH_COMMENT_PREFIX = "synth_"
TOPIC_ID_BASE = 9000

#: Comment templates organized by sentiment. Reused via random.choice so the
#: dataset feels varied but stays compact. Numbers were tuned so the demo
#: gives a recognizable positive-skewed distribution similar to real IG data.
POSITIVE_COMMENTS = [
    "Love this! 😍",
    "🔥🔥🔥 amazing",
    "Goals 💯",
    "This is so good",
    "Saved for later 📌",
    "Where did you get that outfit?",
    "Tutorial please!",
    "You're killing it 👏",
    "Such great vibes",
    "Obsessed with your content",
    "How do you edit your reels?",
    "Cant wait for the next one",
    "❤️❤️❤️",
    "Amazing as always",
    "Need this in my life",
    "What camera do you use?",
    "Stunning shot",
    "Big inspo 🙌",
]

NEUTRAL_COMMENTS = [
    "Interesting",
    "Hmm, okay",
    "Saw this trending",
    "Reminds me of someone",
    "Where is this?",
    "First time seeing your page",
    "Cool",
    "Nice",
    "Not bad",
    "When was this taken?",
]

NEGATIVE_COMMENTS = [
    "Not feeling this one",
    "Could be better",
    "Eh",
    "Pass",
    "Not your best",
    "Disappointed tbh",
]

QUESTION_COMMENTS = [
    "Where did you get that outfit?",
    "Tutorial please!",
    "How do you edit your reels?",
    "What camera do you use?",
    "Where is this?",
    "When was this taken?",
    "What's the song?",
    "Is this Mumbai?",
    "Can you do a part 2?",
    "What lens is that?",
]

#: Synthetic usernames — vaguely realistic without colliding with real ones.
SYNTH_USERNAMES = [
    "creator_lover_22", "design.daily", "the.studio.notes", "minimal_things",
    "neon.afternoon", "morning_mood", "skyllectarchish_fan", "city_strolls",
    "travel.with.t", "moonlight_ave", "frame.by.frame", "weekend_brunch",
    "outdoor_obsessed", "studio.42", "softpalette",
]

#: Topic cluster definitions. cluster_id starts at TOPIC_ID_BASE so they
#: never collide with real cluster ids (the topic_clustering job assigns
#: monotonically-increasing ids starting at 0).
SYNTH_TOPICS = [
    {
        "cluster_id": TOPIC_ID_BASE + 0,
        "label": "outfit questions",
        "size_pct": 0.22,
        "is_question": True,
    },
    {
        "cluster_id": TOPIC_ID_BASE + 1,
        "label": "location curiosity",
        "size_pct": 0.16,
        "is_question": True,
    },
    {
        "cluster_id": TOPIC_ID_BASE + 2,
        "label": "general praise",
        "size_pct": 0.34,
        "is_question": False,
    },
    {
        "cluster_id": TOPIC_ID_BASE + 3,
        "label": "editing / gear",
        "size_pct": 0.12,
        "is_question": True,
    },
    {
        "cluster_id": TOPIC_ID_BASE + 4,
        "label": "save / share",
        "size_pct": 0.10,
        "is_question": False,
    },
    {
        "cluster_id": TOPIC_ID_BASE + 5,
        "label": "constructive criticism",
        "size_pct": 0.06,
        "is_question": False,
    },
]


def _sentiment_for(text: str) -> tuple[str, float, bool]:
    """Classify a synthetic comment deterministically.

    Returns (sentiment, score, is_question). Spam is always False because
    none of our templates look like spam.
    """
    text_lower = text.lower()
    if text in POSITIVE_COMMENTS:
        return ("positive", round(random.uniform(0.4, 0.95), 2), "?" in text)
    if text in NEGATIVE_COMMENTS:
        return ("negative", round(random.uniform(-0.85, -0.3), 2), False)
    return ("neutral", round(random.uniform(-0.15, 0.15), 2), "?" in text)


def seed_for_user(
    user_id: str,
    comments_per_post: int = 6,
    max_posts: int = 25,
    seed: int | None = 17,
) -> dict[str, int]:
    """Seed synthetic Audience Voice data for one user.

    Returns counts ``{comments, sentiment, topics}`` so the caller (router
    endpoint) can report back to the FE.
    """
    if seed is not None:
        random.seed(seed)
    client = get_client()
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        logger.info("seed_demo_sentiment: user %s has no IG profile", user_id)
        return {"comments": 0, "sentiment": 0, "topics": 0}

    media = client.query(
        "SELECT ig_media_id FROM instagram_media FINAL "
        "WHERE user_id = {u:UUID} AND ig_user_id = {ig:String} "
        "  AND media_product_type IN ('FEED','REELS') "
        "ORDER BY timestamp DESC LIMIT {n:UInt32}",
        parameters={"u": user_id, "ig": profile.ig_user_id, "n": max_posts},
    ).result_rows
    if not media:
        return {"comments": 0, "sentiment": 0, "topics": 0}

    # Comment distribution per post — positive-skewed like real engagement.
    sentiment_weights = ("positive", "positive", "positive", "neutral", "neutral", "negative")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    earliest = now - timedelta(days=30)
    total_comments = 0
    total_sentiment = 0
    total_text_seen: list[str] = []

    for (ig_media_id,) in media:
        # Variable comment count per post for realism
        n = random.randint(max(2, comments_per_post - 2), comments_per_post + 3)
        comments_payload: list[dict] = []
        sentiment_payload: list[dict] = []
        for _ in range(n):
            bucket = random.choice(sentiment_weights)
            if random.random() < 0.18:
                text = random.choice(QUESTION_COMMENTS)
            elif bucket == "positive":
                text = random.choice(POSITIVE_COMMENTS)
            elif bucket == "negative":
                text = random.choice(NEGATIVE_COMMENTS)
            else:
                text = random.choice(NEUTRAL_COMMENTS)
            total_text_seen.append(text)

            ts = earliest + timedelta(
                seconds=random.randint(0, int((now - earliest).total_seconds())),
            )
            ig_comment_id = f"{SYNTH_COMMENT_PREFIX}{uuid.uuid4().hex[:14]}"
            username = random.choice(SYNTH_USERNAMES)
            comments_payload.append({
                "id": ig_comment_id,
                "_parent_id": "",
                "username": username,
                "text": text,
                "like_count": random.randint(0, 12),
                "timestamp": ts.replace(tzinfo=timezone.utc).isoformat(),
            })
            sent, score, is_q = _sentiment_for(text)
            sentiment_payload.append({
                "user_id": user_id,
                "ig_comment_id": ig_comment_id,
                "ig_media_id": ig_media_id,
                "sentiment": sent,
                "score": score,
                "is_question": is_q,
                "is_spam": False,
                "model": SYNTH_MODEL,
            })

        total_comments += comment_repo.bulk_insert_comments(
            client, user_id, ig_media_id, comments_payload,
        )
        total_sentiment += comment_repo.bulk_insert_sentiment(
            client, sentiment_payload,
        )

    # Topics — sized as a fraction of the total comment corpus, sample ids
    # drawn from the actual texts we just inserted (best-effort match).
    period_start = earliest
    period_end = now
    clusters: list[dict] = []
    total_n = max(1, total_comments)

    # Helper: pick a few comment ids that match a label theme. Cheap heuristic.
    def _sample_ids(matcher) -> list[str]:
        match_texts = [t for t in total_text_seen if matcher(t)]
        return [
            f"{SYNTH_COMMENT_PREFIX}{uuid.uuid4().hex[:14]}"
            for _ in match_texts[:3]
        ]

    label_matchers = {
        "outfit questions": lambda t: "outfit" in t.lower() or "wear" in t.lower(),
        "location curiosity": lambda t: "where" in t.lower() or "mumbai" in t.lower(),
        "general praise": lambda t: any(w in t.lower() for w in ("love", "amazing", "killing", "obsessed", "stunning")),
        "editing / gear": lambda t: any(w in t.lower() for w in ("edit", "camera", "lens")),
        "save / share": lambda t: "save" in t.lower() or "later" in t.lower(),
        "constructive criticism": lambda t: any(w in t.lower() for w in ("not", "disappoint", "eh", "pass")),
    }

    for spec in SYNTH_TOPICS:
        clusters.append({
            "cluster_id": spec["cluster_id"],
            "label": spec["label"],
            "sample_comment_ids": _sample_ids(label_matchers[spec["label"]]),
            "size": max(1, int(total_n * spec["size_pct"])),
            "is_question": spec["is_question"],
        })

    total_topics = comment_repo.replace_topics_for_user(
        client, user_id, period_start, period_end, clusters,
    )

    logger.info(
        "seed_demo_sentiment: user %s -> %d comments, %d sentiment rows, %d topic clusters",
        user_id, total_comments, total_sentiment, total_topics,
    )
    return {
        "comments": total_comments,
        "sentiment": total_sentiment,
        "topics": total_topics,
    }


def main(user_id: str) -> dict[str, int]:
    return seed_for_user(user_id)


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    if len(sys.argv) < 2:
        print("Usage: python -m app.jobs.seed_demo_sentiment <user_id>")
        sys.exit(1)
    print(main(sys.argv[1]))

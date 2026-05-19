# Tier 2 — Feature 4: Comment Sentiment & Topic Analysis

> **Creator question:** "What is my audience actually saying — not just how many?"
>
> **Why it matters:** Every cheap analytics tool reports comment *counts*. None of them surface *content* of comments. Sentiment + topic clustering on the comment corpus is a sharp differentiator and a natural foundation for later AI features (Tier 4 digest, "why did this post flop").

---

## What we're building

1. **Audience Voice** panel on the **Audience DNA** page:
   - Sentiment distribution donut (% positive / neutral / negative)
   - Top topic chips (clustered themes — e.g., "morning routine," "skincare recs," "Q: where's your dress from?")
   - Sentiment trend line over time
2. **Per-post sentiment** inside the **PostInsightsDrawer**:
   - Mini sentiment breakdown
   - 3 representative comments per sentiment bucket
3. **Question detection** card: posts that generated the most questions (signal for FAQ content / future Reels topics)

```
┌─────────────────────────────────────────────────────────────┐
│  Audience DNA                                                │
├─────────────────────────────────────────────────────────────┤
│  ... existing Tier 1 + Growth Drivers ...                   │
├─────────────────────────────────────────────────────────────┤
│  💬 AUDIENCE VOICE                                           │
│  ┌─────────────────┬─────────────────────────────────────┐  │
│  │ Sentiment       │ Top topics (last 90d)              │  │
│  │ Donut: 72/22/6  │ • morning routine   312 mentions   │  │
│  │ Positive/Neut/  │ • skincare recs     186            │  │
│  │ Negative        │ • where's your X    142  (question)│  │
│  └─────────────────┴─────────────────────────────────────┘  │
│  Sentiment trend line over 12 weeks                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Changes

This is the largest BE work in Tier 2 — comments are a new data layer. Three parallel pipelines:

1. **Sync** — pull comments from Meta Graph API per media item
2. **Analyze** — nightly batch: sentiment scoring (Claude Haiku 4.5) + embeddings for clustering
3. **Serve** — aggregate queries for the new endpoints

### Migration 009 — `instagram_comments`

```sql
-- backend/migrations/009_create_instagram_comments.sql
CREATE TABLE IF NOT EXISTS instagram_comments (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_media_id String,
    ig_comment_id String,
    parent_comment_id String DEFAULT '',  -- '' for top-level
    username String,
    text String,
    like_count UInt32 DEFAULT 0,
    timestamp DateTime,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, ig_media_id, ig_comment_id);
```

### Migration 010 — `comment_sentiment`

```sql
-- backend/migrations/010_create_comment_sentiment.sql
CREATE TABLE IF NOT EXISTS comment_sentiment (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_comment_id String,
    ig_media_id String,
    sentiment Enum8('positive' = 1, 'neutral' = 2, 'negative' = 3),
    score Float32,                       -- -1..+1, normalized
    is_question UInt8 DEFAULT 0,
    is_spam UInt8 DEFAULT 0,
    language String DEFAULT '',
    embedding Array(Float32),            -- length 384 (Sentence-Transformers MiniLM) or 1536 (OpenAI/Voyage)
    model String,                        -- "claude-haiku-4-5" or "voyage-3"
    computed_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(computed_at)
ORDER BY (user_id, ig_comment_id);
```

### Migration 011 — `comment_topics`

```sql
-- backend/migrations/011_create_comment_topics.sql
CREATE TABLE IF NOT EXISTS comment_topics (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    cluster_id UInt32,
    label String,                        -- LLM-generated short title for the cluster
    sample_comment_ids Array(String),    -- 3 representative ig_comment_ids
    size UInt32,                          -- number of comments in cluster
    period_start DateTime,                -- cluster snapshot window
    period_end DateTime,
    computed_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(computed_at)
ORDER BY (user_id, cluster_id, period_start);
```

### Comment sync (per-media)

```python
# backend/app/instagram/service.py
async def fetch_comments_for_media(media_id: str, token: str, max_pages: int = 5) -> list[dict]:
    """Fetch up to max_pages of comments for a single media item."""
    comments = []
    url = f"{GRAPH_BASE_URL}/{media_id}/comments"
    params = {
        "fields": "id,text,username,like_count,timestamp,replies{id,text,username,like_count,timestamp}",
        "access_token": token,
        "limit": 50,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        for _ in range(max_pages):
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            payload = resp.json()
            comments.extend(payload.get("data", []))
            next_url = payload.get("paging", {}).get("next")
            if not next_url:
                break
            url = next_url
            params = {}  # next URL has params baked in
    return comments
```

Add this to the existing sync flow (called for each media after `fetch_media_insights_batch`).

### Sentiment analysis batch job

Use **Claude Haiku 4.5** for sentiment (cheap, fast) and a **Voyage** or **OpenAI embeddings API** for embeddings (don't mix providers — embeddings need to be from the same model for clustering to work).

```python
# backend/app/jobs/sentiment_batch.py
"""Run nightly. Process new comments through Haiku for sentiment + question detection."""
import json
from anthropic import Anthropic
from app.database import get_client
from app.config import settings

anthropic = Anthropic(api_key=settings.anthropic_api_key)

SYSTEM = """You analyze Instagram comments. For each comment, respond with a single JSON object:
{"sentiment": "positive"|"neutral"|"negative", "score": -1..1, "is_question": true|false, "is_spam": true|false}
Be strict on spam (giveaway bots, copy-paste promo, link spam). Treat emojis-only as the sentiment they convey."""

def analyze_batch(comments: list[dict]) -> list[dict]:
    """Process comments in batches of 20 via Claude Haiku."""
    results = []
    for i in range(0, len(comments), 20):
        batch = comments[i:i+20]
        # One call per batch; Haiku is cheap enough that 20 separate-comment messages is fine
        for c in batch:
            resp = anthropic.messages.create(
                model="claude-haiku-4-5",
                max_tokens=120,
                system=SYSTEM,
                messages=[{"role": "user", "content": c["text"][:500]}],
            )
            try:
                parsed = json.loads(resp.content[0].text)
                results.append({**parsed, "ig_comment_id": c["ig_comment_id"]})
            except Exception:
                results.append({"sentiment": "neutral", "score": 0, "is_question": False, "is_spam": False, "ig_comment_id": c["ig_comment_id"]})
    return results

def main():
    client = get_client()
    # Comments without sentiment yet
    rows = client.query("""
        SELECT c.user_id, c.ig_comment_id, c.ig_media_id, c.text
        FROM instagram_comments c FINAL
        LEFT JOIN comment_sentiment s FINAL ON c.ig_comment_id = s.ig_comment_id
        WHERE s.ig_comment_id = '' OR s.ig_comment_id IS NULL
        LIMIT 5000
    """).result_rows
    if not rows:
        return
    by_user: dict[str, list] = {}
    for r in rows:
        by_user.setdefault(r[0], []).append({"ig_comment_id": r[1], "ig_media_id": r[2], "text": r[3]})
    for user_id, comments in by_user.items():
        analyzed = analyze_batch(comments)
        # bulk insert into comment_sentiment ...

if __name__ == "__main__":
    main()
```

Schedule it via a cron job (e.g., daily at 03:00 UTC). For initial backfill, raise the LIMIT and run it once.

### Embeddings + clustering

Separate job, runs weekly. For each user, take the last 90 days of comments, fetch embeddings, run k-means (`k = 8–12` heuristically). Then ask Claude to label each cluster from 5 representative comments.

```python
# backend/app/jobs/topic_clustering.py
"""Weekly job. Cluster recent comments and label clusters via LLM."""
import numpy as np
from sklearn.cluster import KMeans
from anthropic import Anthropic
# (embeddings can come from Voyage AI; for the snippet, assume embedding column populated by sentiment_batch)

def cluster_for_user(user_id: str, since, until):
    client = get_client()
    rows = client.query("""
        SELECT s.ig_comment_id, c.text, s.embedding
        FROM comment_sentiment s FINAL
        INNER JOIN instagram_comments c FINAL ON s.ig_comment_id = c.ig_comment_id
        WHERE s.user_id = {user_id:UUID}
          AND s.is_spam = 0
          AND c.timestamp BETWEEN {since:DateTime} AND {until:DateTime}
        LIMIT 5000
    """, parameters={"user_id": user_id, "since": since, "until": until}).result_rows

    if len(rows) < 50:
        return

    embeddings = np.array([r[2] for r in rows])
    k = min(12, max(4, len(rows) // 60))
    labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(embeddings)

    # For each cluster: sample 5 comments closest to centroid, ask Claude for a short label
    clusters_out = []
    for cluster_id in range(k):
        mask = labels == cluster_id
        cluster_comments = [rows[i] for i in np.where(mask)[0]][:5]
        sample_text = "\n".join(f"- {c[1][:200]}" for c in cluster_comments)
        label_resp = anthropic.messages.create(
            model="claude-haiku-4-5",
            max_tokens=40,
            system="Summarize the common topic of these Instagram comments in 4 words or fewer. Output only the label.",
            messages=[{"role": "user", "content": sample_text}],
        )
        clusters_out.append({
            "cluster_id": cluster_id,
            "label": label_resp.content[0].text.strip(),
            "sample_comment_ids": [c[0] for c in cluster_comments],
            "size": int(mask.sum()),
        })
    # Bulk insert into comment_topics ...
```

### Endpoints

```python
# backend/app/instagram/router.py

@router.get("/insights/sentiment", response_model=SentimentSummaryResponse)
def get_sentiment_summary(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Overall sentiment distribution + trend buckets for the period."""
    ...

@router.get("/insights/sentiment/topics", response_model=TopicsResponse)
def get_topics(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Top topic clusters for the period."""
    ...

@router.get("/insights/sentiment/questions", response_model=QuestionPostsResponse)
def get_question_posts(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
):
    """Posts ranked by # of question-comments — signals FAQ content opportunities."""
    ...

@router.get("/insights/sentiment/media/{media_id}", response_model=MediaSentimentResponse)
def get_media_sentiment(
    media_id: str,
    current_user: User = Depends(get_current_user),
):
    """Per-post sentiment breakdown + 3 representative comments per bucket."""
    ...
```

### Aggregation SQL

```sql
GET_SENTIMENT_SUMMARY = """
SELECT
    sentiment,
    count() AS total,
    countIf(is_question = 1) AS questions,
    countIf(is_spam = 1) AS spam
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL ON s.ig_comment_id = c.ig_comment_id
WHERE s.user_id = {user_id:UUID}
  AND c.timestamp >= {since:DateTime}
  AND s.is_spam = 0
GROUP BY sentiment
"""

GET_SENTIMENT_TREND = """
SELECT
    toStartOfWeek(c.timestamp) AS week_start,
    countIf(s.sentiment = 'positive') AS positive,
    countIf(s.sentiment = 'neutral') AS neutral,
    countIf(s.sentiment = 'negative') AS negative
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL ON s.ig_comment_id = c.ig_comment_id
WHERE s.user_id = {user_id:UUID}
  AND c.timestamp >= {since:DateTime}
  AND s.is_spam = 0
GROUP BY week_start
ORDER BY week_start
"""

GET_QUESTION_POSTS = """
SELECT
    c.ig_media_id, m.permalink, m.thumbnail_url, m.caption, m.timestamp,
    countIf(s.is_question = 1) AS question_count,
    count() AS total_comments
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL ON s.ig_comment_id = c.ig_comment_id
INNER JOIN instagram_media m FINAL ON c.ig_media_id = m.ig_media_id AND c.user_id = m.user_id
WHERE s.user_id = {user_id:UUID}
  AND c.timestamp >= {since:DateTime}
  AND s.is_spam = 0
GROUP BY c.ig_media_id, m.permalink, m.thumbnail_url, m.caption, m.timestamp
HAVING question_count > 0
ORDER BY question_count DESC
LIMIT {limit:UInt32}
"""
```

---

## Frontend Implementation

### Phase 1: Hooks

```jsx
// src/hooks/useSentiment.js
import { useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

export function useSentimentSummary() {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/instagram/insights/sentiment?days=${days}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [days]);
  return { data, loading };
}

export function useTopics() {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/instagram/insights/sentiment/topics?days=${days}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [days]);
  return { data, loading };
}

export function useQuestionPosts(limit = 10) {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/instagram/insights/sentiment/questions?days=${days}&limit=${limit}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [days, limit]);
  return { data, loading };
}

export function useMediaSentiment(mediaId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!mediaId) return;
    setLoading(true);
    api.get(`/instagram/insights/sentiment/media/${mediaId}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [mediaId]);
  return { data, loading };
}
```

### Phase 2: SentimentDonut

`src/components/audience-dna/SentimentDonut.jsx`:

```jsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import AnimatedCard from "../shared/AnimatedCard";
import { useSentimentSummary } from "../../hooks/useSentiment";

const COLORS = { positive: "#10b981", neutral: "#94a3b8", negative: "#f43f5e" };
const LABELS = { positive: "Positive", neutral: "Neutral", negative: "Negative" };

export default function SentimentDonut() {
  const { data, loading } = useSentimentSummary();
  if (loading || !data) return null;

  const dist = data.distribution ?? {};
  const total = (dist.positive ?? 0) + (dist.neutral ?? 0) + (dist.negative ?? 0);
  const pieData = ["positive", "neutral", "negative"].map((k) => ({ name: k, value: dist[k] ?? 0 }));

  return (
    <AnimatedCard className="p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Audience Sentiment</h3>

      {total === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">No comments analysed yet.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-[160px] h-[160px] relative">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={48} outerRadius={70} startAngle={90} endAngle={-270} paddingAngle={2}>
                  {pieData.map((p) => <Cell key={p.name} fill={COLORS[p.name]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-display font-semibold">{total.toLocaleString()}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">comments</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {pieData.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[p.name] }} />
                  <span className="text-slate-600">{LABELS[p.name]}</span>
                </span>
                <span className="font-mono text-slate-800">
                  {total > 0 ? ((p.value / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AnimatedCard>
  );
}
```

### Phase 3: TopicChips

`src/components/audience-dna/TopicChips.jsx`:

```jsx
import { motion } from "framer-motion";
import { MessageCircle, HelpCircle } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { useTopics } from "../../hooks/useSentiment";

export default function TopicChips() {
  const { data, loading } = useTopics();
  if (loading || !data) return null;
  const topics = data.topics ?? [];

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">What your audience is talking about</h3>

      {topics.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Need at least 50 analysed comments to detect topics.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topics.map((t, i) => (
            <motion.div
              key={t.cluster_id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", duration: 0.4, bounce: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] border border-slate-200 bg-white"
            >
              <span className="text-slate-700 font-medium">{t.label}</span>
              <span className="text-slate-400 font-mono">{t.size}</span>
              {t.is_question && <HelpCircle size={11} className="text-amber-500" />}
            </motion.div>
          ))}
        </div>
      )}
    </AnimatedCard>
  );
}
```

### Phase 4: SentimentTrend (line chart)

`src/components/audience-dna/SentimentTrendChart.jsx` — stacked area with positive/neutral/negative over weeks. Uses Recharts `AreaChart` with three `<Area>` stacked.

### Phase 5: Per-post sentiment in PostInsightsDrawer

Extend the existing `PostInsightsDrawer.jsx`:

```jsx
import { useMediaSentiment } from "../../hooks/useSentiment";

function SentimentSection({ mediaId }) {
  const { data, loading } = useMediaSentiment(mediaId);
  if (loading) return <div className="h-24 shimmer-line rounded-lg" />;
  if (!data || data.total === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Audience reaction</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {["positive", "neutral", "negative"].map((s) => (
          <div key={s} className="rounded-lg p-2 text-center" style={{ background: `${COLORS[s]}10` }}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s}</p>
            <p className="font-mono font-semibold" style={{ color: COLORS[s] }}>
              {((data.distribution[s] / data.total) * 100).toFixed(0)}%
            </p>
          </div>
        ))}
      </div>
      {/* Sample comments per sentiment */}
      <div className="space-y-1.5 max-h-32 overflow-y-auto">
        {data.samples?.map((c) => (
          <div key={c.ig_comment_id} className="text-[11px] text-slate-600 italic">
            "{c.text.slice(0, 120)}{c.text.length > 120 ? "…" : ""}"
            <span className="ml-1 text-slate-400">— @{c.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Phase 6: Compose into AudienceDNAPage

```jsx
// src/pages/AudienceDNAPage.jsx
import SentimentDonut from "../components/audience-dna/SentimentDonut";
import TopicChips from "../components/audience-dna/TopicChips";
import SentimentTrendChart from "../components/audience-dna/SentimentTrendChart";

// In the JSX, after Growth Drivers / Spike Timeline:
<div className="mt-6 space-y-4">
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
    <div className="lg:col-span-5"><SentimentDonut /></div>
    <div className="lg:col-span-7"><TopicChips /></div>
  </div>
  <SentimentTrendChart />
</div>
```

---

## Edge Cases & Operational Notes

| Case | Handling |
|------|----------|
| Comment in another language | Claude Haiku handles dozens of languages. Store `language` field for future per-language filtering. |
| Emoji-only comments | Sentiment still derived (😍 = positive, 😡 = negative). Treat as a real signal. |
| Spam (bot giveaways, "Nice ❤️ check my page") | Flagged at sentiment-job time; excluded from aggregates by default. Add a toggle to include them if user wants. |
| LLM cost | ~$0.30 per 1k comments at Haiku rates. Cache aggressively — never re-analyse a comment whose `text` hasn't changed. |
| PII in comments | Comments are public on Instagram, but minimize exposure: don't ship them to third-party tools without consent. Apply minimal redaction (e.g., phone-number regex) before display. |
| Topic clustering jitter week-to-week | Cluster labels can drift if recomputed weekly. To mitigate, retain prior cluster labels for matching (cosine similarity > 0.85 → same label). |
| Per-post sentiment with < 10 comments | Don't show — too noisy. Empty state: "Need at least 10 comments." |
| Sentiment-API failure mid-batch | Mark batch as failed; sentiment job retries on next run. Aggregate queries already handle missing rows by skipping. |

---

## Animation Polish

| Element | Behavior |
|---------|----------|
| Donut entry | Sweep from 90° to -270° (already built into Recharts) — keep the default polish |
| Topic chips | Stagger 40ms, spring scale-in |
| Sentiment trend areas | Path-draw animation (existing CSS keyframe `drawLine`) |
| PostDrawer sentiment section | Slide down with `initial={{ height: 0 }} animate={{ height: "auto" }}` |

---

## Checklist

| # | Task | File | Status |
|---|------|------|--------|
| F4.1 | BE: migration 009 (instagram_comments) | `backend/migrations/009_create_instagram_comments.sql` | ⬜ |
| F4.2 | BE: migration 010 (comment_sentiment) | `backend/migrations/010_create_comment_sentiment.sql` | ⬜ |
| F4.3 | BE: migration 011 (comment_topics) | `backend/migrations/011_create_comment_topics.sql` | ⬜ |
| F4.4 | BE: fetch_comments_for_media in service | `backend/app/instagram/service.py` | ⬜ |
| F4.5 | BE: integrate comment sync into existing flow | `backend/app/instagram/service.py` + router | ⬜ |
| F4.6 | BE: sentiment_batch job (Haiku) | `backend/app/jobs/sentiment_batch.py` | ⬜ |
| F4.7 | BE: topic_clustering job (KMeans + label LLM) | `backend/app/jobs/topic_clustering.py` | ⬜ |
| F4.8 | BE: 4 endpoints (sentiment / topics / questions / per-media) | `backend/app/instagram/router.py` + schemas | ⬜ |
| F4.9 | BE: schedule jobs (cron or APScheduler) | infra | ⬜ |
| F4.10 | BE: anthropic env var + config | `backend/app/config.py`, `.env.example` | ⬜ |
| F4.11 | FE: useSentiment / useTopics / useQuestionPosts / useMediaSentiment hooks | `frontend/src/hooks/useSentiment.js` | ⬜ |
| F4.12 | FE: SentimentDonut | `frontend/src/components/audience-dna/SentimentDonut.jsx` | ⬜ |
| F4.13 | FE: TopicChips | `frontend/src/components/audience-dna/TopicChips.jsx` | ⬜ |
| F4.14 | FE: SentimentTrendChart | `frontend/src/components/audience-dna/SentimentTrendChart.jsx` | ⬜ |
| F4.15 | FE: PostInsightsDrawer sentiment section | `frontend/src/components/dashboard/PostInsightsDrawer.jsx` | ⬜ |
| F4.16 | FE: Compose into AudienceDNAPage | `frontend/src/pages/AudienceDNAPage.jsx` | ⬜ |

**FE effort:** ~3 days. **BE effort:** ~7 days (sync pipeline + 2 batch jobs). **Total:** 2 weeks.

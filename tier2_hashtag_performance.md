# Tier 2 — Feature 2: Hashtag Performance Tracking

> **Creator question:** "Which hashtags actually work for *my* posts — and which combinations overperform?"
>
> **Why it matters:** Generic "trending hashtag" tools have lost trust. Per-account hashtag analytics on your *own* historical posts is concrete, defensible, and pure SQL on data already in ClickHouse.

---

## What we're building

A new **Hashtags** section on the **Content Lab** page with three components:

1. **HashtagPerformanceTable** — every hashtag used at least N times, ranked by average engagement
2. **HashtagTrendChart** — a single hashtag's engagement over time (with the per-period comparator inherited from F1)
3. **HashtagComboHeatmap** — co-occurring pairs that overperform the average

```
┌─────────────────────────────────────────────────────────────┐
│  🧪 Content Lab                                              │
├─────────────────────────────────────────────────────────────┤
│  ... existing Format Breakdown / Algorithm Score / Best     │
│      Time components ...                                     │
├─────────────────────────────────────────────────────────────┤
│  # HASHTAGS                                                  │
│  ┌─────────────────────────┬─────────────────────────────┐   │
│  │ Top hashtags table      │ Trend chart (selected tag)  │   │
│  │ #behindthescenes  4.8%  │  ↗ engagement over 90d     │   │
│  │ #morningroutine   3.9%  │                             │   │
│  │ ...                     │                             │   │
│  └─────────────────────────┴─────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Combo heatmap — co-occurrence × overperformance      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Changes

### Migration 008 — denormalized `post_hashtags`

Extracting hashtags at query time from `instagram_media.caption` works but is slow and re-parses on every query. Instead, denormalize.

```sql
-- backend/migrations/008_create_post_hashtags.sql
CREATE TABLE IF NOT EXISTS post_hashtags (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_media_id String,
    hashtag String,                       -- lowercase, without leading #
    position UInt16,                      -- order within caption (helps detect trailing-spam vs intentional)
    timestamp DateTime,                   -- copied from instagram_media for fast filtering
    media_product_type String,            -- ditto
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, hashtag, ig_media_id);
```

The `ORDER BY (user_id, hashtag, ig_media_id)` is intentional: hashtag lookups are the most common access pattern.

### Extraction pipeline

Two paths:

1. **Backfill** (one-time) — scan all `instagram_media` rows, extract hashtags, bulk-insert into `post_hashtags`.
2. **Incremental** — every time `bulk_insert_media` runs, also extract + insert hashtags for the new rows.

```python
# backend/app/instagram/hashtags.py
import re

# Unicode hashtag regex: # + (alnum or _ or 1-letter-numeric-underscore variants in many scripts)
_HASHTAG_RE = re.compile(r"#([A-Za-z0-9_À-￿]+)", re.UNICODE)

def extract_hashtags(caption: str) -> list[tuple[str, int]]:
    """Return [(hashtag_lowercase, position), ...]"""
    if not caption:
        return []
    matches = _HASHTAG_RE.finditer(caption)
    return [(m.group(1).lower(), m.start()) for m in matches]
```

Notes on the regex:
- Allows Unicode (`À-￿`) so multilingual hashtags (Hindi, Spanish, Korean, etc.) work
- Does **not** match `@mentions`, intentionally
- Does **not** match hashtags inside URLs (those are rare and parsing them properly isn't worth it)

Update `bulk_insert_media` to also write hashtags:

```python
# backend/app/repositories/instagram_repo.py
from ..instagram.hashtags import extract_hashtags

def bulk_insert_media(client, user_id, ig_user_id, media_list):
    # ... existing media insert ...

    # Hashtag extraction
    hashtag_rows = []
    for item in media_list:
        caption = item.get("caption", "")
        for tag, pos in extract_hashtags(caption):
            hashtag_rows.append([
                str(uuid.uuid4()),
                user_id,
                item["id"],
                tag,
                pos,
                # parse timestamp same as media row
                parse_ig_timestamp(item.get("timestamp")),
                item.get("media_product_type", ""),
                now,
            ])
    if hashtag_rows:
        client.insert(
            "post_hashtags",
            hashtag_rows,
            column_names=["id", "user_id", "ig_media_id", "hashtag", "position", "timestamp", "media_product_type", "fetched_at"],
        )
```

### Backfill script

```python
# backend/scripts/backfill_hashtags.py
"""Run once after migration 008 to populate hashtags for existing media."""
from app.database import get_client
from app.instagram.hashtags import extract_hashtags
import uuid
from datetime import datetime, timezone

def main():
    client = get_client()
    rows = client.query(
        "SELECT user_id, ig_media_id, caption, timestamp, media_product_type FROM instagram_media FINAL"
    ).result_rows
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    bulk = []
    for user_id, ig_media_id, caption, ts, mpt in rows:
        for tag, pos in extract_hashtags(caption or ""):
            bulk.append([str(uuid.uuid4()), user_id, ig_media_id, tag, pos, ts, mpt, now])
    if bulk:
        client.insert(
            "post_hashtags", bulk,
            column_names=["id", "user_id", "ig_media_id", "hashtag", "position", "timestamp", "media_product_type", "fetched_at"],
        )
    print(f"Inserted {len(bulk)} hashtag rows")

if __name__ == "__main__":
    main()
```

### SQL queries

```python
# backend/app/models/queries.py

GET_TOP_HASHTAGS = """
SELECT
    h.hashtag,
    count(DISTINCT h.ig_media_id) AS post_count,
    avg(metrics.reach) AS avg_reach,
    avgIf(metrics.total_interactions / metrics.reach * 100, metrics.reach > 0) AS avg_engagement_rate_pct,
    avgIf(metrics.saved / metrics.reach * 100, metrics.reach > 0) AS avg_save_rate_pct
FROM post_hashtags h FINAL
INNER JOIN (
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions,
        sumIf(metric_value, metric_name = 'saved') AS saved
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON h.ig_media_id = metrics.ig_media_id AND h.user_id = metrics.user_id
WHERE h.user_id = {user_id:UUID}
  AND h.timestamp >= {since:DateTime}
GROUP BY h.hashtag
HAVING post_count >= {min_uses:UInt8}
ORDER BY avg_engagement_rate_pct DESC
LIMIT {limit:UInt32}
"""

GET_HASHTAG_TREND = """
SELECT
    toStartOfWeek(h.timestamp) AS week_start,
    count(DISTINCT h.ig_media_id) AS posts_used,
    avg(metrics.reach) AS avg_reach,
    avgIf(metrics.total_interactions / metrics.reach * 100, metrics.reach > 0) AS avg_engagement_rate_pct
FROM post_hashtags h FINAL
INNER JOIN (
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON h.ig_media_id = metrics.ig_media_id AND h.user_id = metrics.user_id
WHERE h.user_id = {user_id:UUID}
  AND h.hashtag = {tag:String}
  AND h.timestamp >= {since:DateTime}
GROUP BY week_start
ORDER BY week_start
"""

-- Co-occurrence: pairs of hashtags appearing on the same post, ranked by uplift vs each tag's solo avg
GET_HASHTAG_COMBOS = """
WITH
    -- Per-post engagement rates
    post_engagement AS (
        SELECT m.ig_media_id, m.user_id,
            avgIf(mi.metric_value, mi.metric_name = 'total_interactions') /
            nullIf(avgIf(mi.metric_value, mi.metric_name = 'reach'), 0) * 100 AS engagement_pct
        FROM instagram_media m FINAL
        INNER JOIN media_insights mi FINAL
            ON m.ig_media_id = mi.ig_media_id AND m.user_id = mi.user_id
        WHERE m.user_id = {user_id:UUID}
          AND m.timestamp >= {since:DateTime}
        GROUP BY m.ig_media_id, m.user_id
    ),
    -- Hashtag co-occurrence pairs
    pairs AS (
        SELECT
            arraySort([h1.hashtag, h2.hashtag])[1] AS tag_a,
            arraySort([h1.hashtag, h2.hashtag])[2] AS tag_b,
            h1.ig_media_id
        FROM post_hashtags h1 FINAL
        INNER JOIN post_hashtags h2 FINAL
            ON h1.user_id = h2.user_id AND h1.ig_media_id = h2.ig_media_id
        WHERE h1.user_id = {user_id:UUID}
          AND h1.timestamp >= {since:DateTime}
          AND h1.hashtag < h2.hashtag
    )
SELECT
    pairs.tag_a, pairs.tag_b,
    count(DISTINCT pairs.ig_media_id) AS cooccurrence_count,
    avg(pe.engagement_pct) AS avg_engagement_pct
FROM pairs
INNER JOIN post_engagement pe ON pe.ig_media_id = pairs.ig_media_id
GROUP BY tag_a, tag_b
HAVING cooccurrence_count >= {min_uses:UInt8}
ORDER BY avg_engagement_pct DESC
LIMIT 50
"""
```

### Endpoints

```python
# backend/app/instagram/router.py
@router.get("/insights/hashtags", response_model=HashtagsResponse)
def get_top_hashtags(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(30, ge=1, le=100),
    min_uses: int = Query(2, ge=1, le=20),
    current_user: User = Depends(get_current_user),
):
    """Top hashtags for the authenticated user, ranked by average engagement rate."""
    # standard pattern: get_client, find_profile, compute since, call repo
    ...

@router.get("/insights/hashtags/trend", response_model=HashtagTrendResponse)
def get_hashtag_trend(
    tag: str = Query(..., min_length=1, max_length=100),
    days: int = Query(180, ge=30, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Engagement trend over time for a single hashtag."""
    ...

@router.get("/insights/hashtags/combos", response_model=HashtagComboResponse)
def get_hashtag_combos(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    min_uses: int = Query(2, ge=2, le=20),
    current_user: User = Depends(get_current_user),
):
    """Top co-occurring hashtag pairs ranked by combined engagement."""
    ...
```

---

## Frontend Implementation

### Phase 1: Hooks

```jsx
// src/hooks/useHashtags.js
import { useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

export function useTopHashtags(limit = 30, minUses = 2) {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/instagram/insights/hashtags?days=${days}&limit=${limit}&min_uses=${minUses}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [days, limit, minUses]);
  return { data, loading };
}

export function useHashtagTrend(tag) {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!tag) return;
    setLoading(true);
    api.get(`/instagram/insights/hashtags/trend?tag=${encodeURIComponent(tag)}&days=${days}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [tag, days]);
  return { data, loading };
}

export function useHashtagCombos(minUses = 2) {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/instagram/insights/hashtags/combos?days=${days}&min_uses=${minUses}`)
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, [days, minUses]);
  return { data, loading };
}
```

### Phase 2: HashtagPerformanceTable

`src/components/content-lab/HashtagPerformanceTable.jsx`:

```jsx
import { motion } from "framer-motion";
import { Hash, TrendingUp } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useTopHashtags } from "../../hooks/useHashtags";

export default function HashtagPerformanceTable({ selected, onSelect }) {
  const { data, loading } = useTopHashtags(30, 2);
  if (loading) return <SkeletonChart height="h-[420px]" />;
  const tags = data?.data ?? [];

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Hash size={14} /> Top Hashtags
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            By average engagement rate across your posts.
          </p>
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          No hashtags used 2+ times yet.
        </p>
      ) : (
        <div className="space-y-0.5 max-h-[360px] overflow-y-auto pr-1">
          {tags.map((t, i) => (
            <motion.button
              key={t.hashtag}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02, type: "spring", duration: 0.3, bounce: 0 }}
              onClick={() => onSelect(t.hashtag)}
              className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left ${
                selected === t.hashtag ? "bg-violet-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-slate-400 w-5 text-right">#{i+1}</span>
                <span className="text-xs text-violet-700 font-medium truncate">#{t.hashtag}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{t.post_count} posts</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                  <TrendingUp size={10} /> {t.avg_engagement_rate_pct.toFixed(1)}%
                </span>
                <span className="text-slate-400">{Math.round(t.avg_reach).toLocaleString()}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </AnimatedCard>
  );
}
```

### Phase 3: HashtagTrendChart

`src/components/content-lab/HashtagTrendChart.jsx`:

```jsx
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedCard from "../shared/AnimatedCard";
import { useHashtagTrend } from "../../hooks/useHashtags";

export default function HashtagTrendChart({ tag }) {
  const { data, loading } = useHashtagTrend(tag);

  return (
    <AnimatedCard className="p-5 min-h-[420px]" delay={0.1}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {tag ? `#${tag}` : "Select a hashtag"}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {tag ? "Engagement rate per week" : "Click a row on the left to see its trend."}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!tag ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="h-[340px] flex items-center justify-center text-xs text-slate-300">
            ← pick a hashtag
          </motion.div>
        ) : loading ? (
          <div className="h-[340px] shimmer-line rounded-lg" />
        ) : (
          <motion.div key={tag} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={data?.data ?? []}>
                <defs>
                  <linearGradient id="tagTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week_start" tickFormatter={(d) => d.slice(5)} fontSize={10} stroke="#cbd5e1" />
                <YAxis fontSize={10} stroke="#cbd5e1" tickFormatter={(v) => `${v.toFixed(1)}%`} />
                <Tooltip />
                <Area
                  dataKey="avg_engagement_rate_pct"
                  stroke="#8b5cf6"
                  fill="url(#tagTrend)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedCard>
  );
}
```

### Phase 4: HashtagComboHeatmap

`src/components/content-lab/HashtagComboHeatmap.jsx` — top 12 combos as a bubble cloud (not a literal heatmap; pairs are too sparse for a grid). Bubble size = co-occurrence count, bubble color = engagement uplift vs median.

```jsx
import { motion } from "framer-motion";
import AnimatedCard from "../shared/AnimatedCard";
import { useHashtagCombos } from "../../hooks/useHashtags";

export default function HashtagComboHeatmap() {
  const { data, loading } = useHashtagCombos(2);
  if (loading) return null;
  const combos = (data?.data ?? []).slice(0, 12);
  const median = combos.length ? combos[Math.floor(combos.length / 2)].avg_engagement_pct : 0;

  return (
    <AnimatedCard className="p-5" delay={0.15}>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">Hashtag combos that overperform</h3>
      <p className="text-xs text-slate-500 mb-4">Pairs co-occurring on multiple posts, ranked by combined engagement.</p>

      <div className="flex flex-wrap gap-2">
        {combos.map((c, i) => {
          const uplift = c.avg_engagement_pct - median;
          const isAbove = uplift > 0;
          return (
            <motion.div
              key={`${c.tag_a}|${c.tag_b}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, type: "spring", duration: 0.45, bounce: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px]"
              style={{
                background: isAbove ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.04)",
                borderColor: isAbove ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.15)",
              }}
            >
              <span className="text-violet-700 font-medium">#{c.tag_a}</span>
              <span className="text-slate-300">+</span>
              <span className="text-violet-700 font-medium">#{c.tag_b}</span>
              <span className={isAbove ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                {c.avg_engagement_pct.toFixed(1)}%
              </span>
              <span className="text-slate-400">×{c.cooccurrence_count}</span>
            </motion.div>
          );
        })}
      </div>
    </AnimatedCard>
  );
}
```

### Phase 5: Compose into Content Lab

Add a new section after the existing Tier 1 components:

```jsx
// src/pages/ContentLabPage.jsx
import HashtagPerformanceTable from "../components/content-lab/HashtagPerformanceTable";
import HashtagTrendChart from "../components/content-lab/HashtagTrendChart";
import HashtagComboHeatmap from "../components/content-lab/HashtagComboHeatmap";

export default function ContentLabPage() {
  const [selectedTag, setSelectedTag] = useState(null);
  // ... existing state ...

  return (
    <DashboardLayout>
      <PageHeader title="Content Lab" emoji="🧪" subtitle="…" />

      {/* existing rows ... */}

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <HashtagPerformanceTable selected={selectedTag} onSelect={setSelectedTag} />
          </div>
          <div className="lg:col-span-7">
            <HashtagTrendChart tag={selectedTag} />
          </div>
        </div>
        <HashtagComboHeatmap />
      </div>
    </DashboardLayout>
  );
}
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| Caption with 30+ tags ("trailing-spam") | All extracted; UI shows them. Add an optional filter "Ignore trailing-only (position > 200 chars)" toggle on the table. |
| Multilingual hashtags | Regex already supports Unicode; display them as-is. |
| Same hashtag with different casing (#Reels vs #reels) | Normalized to lowercase at insert time. Deduplication happens naturally. |
| Hashtag appears in URL inside caption (e.g., a copy-pasted link) | Currently extracted. Mitigation: strip URLs before regex (optional, future) |
| Combo heatmap with < 6 valid combos | Render fewer bubbles, no empty state needed — sparse is fine |
| Trend chart for a hashtag used only once | Disable selection in the table (gated by `min_uses` server-side) |
| Hashtag with special characters like #c++ | Regex doesn't match `+`. Acceptable — Instagram doesn't render these as hashtags either. |

---

## Animation Polish

| Element | Behavior |
|---------|----------|
| Row selection | `bg-violet-50` with `transition-colors duration-200`. Selected row's left edge gets a 2px violet bar via pseudo-element. |
| Trend chart swap | `AnimatePresence mode="wait"` with key on `tag` — old chart fades out, new fades in |
| Combo bubbles | Stagger 40ms, scale-in from 0.85 |
| "No data yet" empty state | Subtle pulse on the `←` arrow to draw eye to the table |

---

## Checklist

| # | Task | File | Status |
|---|------|------|--------|
| F2.1 | BE: migration 008 (post_hashtags table) | `backend/migrations/008_create_post_hashtags.sql` | ⬜ |
| F2.2 | BE: hashtags.py extraction util | `backend/app/instagram/hashtags.py` | ⬜ |
| F2.3 | BE: extend bulk_insert_media to also insert hashtags | `backend/app/repositories/instagram_repo.py` | ⬜ |
| F2.4 | BE: backfill_hashtags script | `backend/scripts/backfill_hashtags.py` | ⬜ |
| F2.5 | BE: GET_TOP_HASHTAGS, GET_HASHTAG_TREND, GET_HASHTAG_COMBOS queries | `backend/app/models/queries.py` | ⬜ |
| F2.6 | BE: repo functions | `backend/app/repositories/insights_repo.py` | ⬜ |
| F2.7 | BE: 3 endpoints (hashtags / trend / combos) + schemas | `backend/app/instagram/router.py`, `schemas.py` | ⬜ |
| F2.8 | FE: useHashtags hooks | `frontend/src/hooks/useHashtags.js` | ⬜ |
| F2.9 | FE: HashtagPerformanceTable | `frontend/src/components/content-lab/HashtagPerformanceTable.jsx` | ⬜ |
| F2.10 | FE: HashtagTrendChart | `frontend/src/components/content-lab/HashtagTrendChart.jsx` | ⬜ |
| F2.11 | FE: HashtagComboHeatmap | `frontend/src/components/content-lab/HashtagComboHeatmap.jsx` | ⬜ |
| F2.12 | FE: Compose into ContentLabPage | `frontend/src/pages/ContentLabPage.jsx` | ⬜ |

**FE effort:** ~2.5 days. **BE effort:** ~2.5 days (incl. backfill). **Total:** 1 week.

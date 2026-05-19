# Tier 2 — Feature 5: Audience Growth Drivers

> **Creator question:** "I gained +500 followers yesterday — which post drove that?"
>
> **Why it matters:** Native Insights shows total daily follows but doesn't connect them to specific posts. Attributing follower-gain to content is what creators actually need to decide what to make next.

---

## What we're building

A new **Growth Drivers** panel on the **Audience DNA** page that:

1. Lists the **top 10 posts** ranked by *attributed follower acquisition*
2. Renders an attribution flow chart (post reach → follower spike, same-day or +1d)
3. Surfaces a **per-post follower-conversion rate** = new_follows_within_48h ÷ non_follower_reach

Also augments the existing `SpikeTimeline`: when a spike dot is clicked, the candidate driver posts are shown inline instead of a generic advisory.

```
┌─────────────────────────────────────────────────────────────┐
│  Audience DNA  👥                                            │
├─────────────────────────────────────────────────────────────┤
│  ... existing Quality cards, Radar, Cohort table ...        │
├─────────────────────────────────────────────────────────────┤
│  📈 GROWTH DRIVERS — top posts that earned you followers    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Rank │ Thumb │ Caption │ Reach │ +Follows │ Rate %    │  │
│  │   1  │ [img] │ "How I..│ 12.3k │   +312   │  2.5%     │  │
│  │   2  │ [img] │ "Behind │  9.8k │   +201   │  2.0%     │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  SPIKE TIMELINE (enhanced)                                  │
│  Click red dot → expands inline with candidate post list    │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Changes

### Attribution model (simple, defensible)

Avoid claiming causal certainty. The model:

> A post is a **candidate driver** for a daily follow-count spike if it was published in a window from **24 hours before** the spike to **the same day**, **and** had reach in the top quintile for that user.
>
> Each candidate gets an attribution share proportional to its non-follower reach divided by the sum of non-follower reach across all candidates that day.

This is deliberately conservative and easy to explain to the user — never claim "this post caused +312 followers"; we say "this post likely drove a portion of +312 followers."

### SQL: candidate posts per day

Add to `app/models/queries.py`:

```sql
-- Daily follow counts from account_insights
GET_DAILY_FOLLOWS = """
SELECT
    toDate(end_time) AS day,
    sumIf(metric_value, metric_name = 'follows') AS daily_follows
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND end_time >= {since:DateTime}
GROUP BY day
ORDER BY day
"""

-- Per-post reach with non-follower split (uses existing pivot)
-- Falls back to total reach if non_follower_reach not available
GET_POSTS_FOR_ATTRIBUTION = """
SELECT
    m.ig_media_id,
    toDate(m.timestamp) AS post_day,
    m.permalink, m.thumbnail_url, m.caption, m.media_product_type,
    metrics.reach,
    metrics.non_follower_reach
FROM instagram_media m FINAL
INNER JOIN (
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'non_follower_reach') AS non_follower_reach
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
"""
```

> **Note on `non_follower_reach`:** Meta's IG Insights API exposes reach broken down by follower type (`follower` / `non_follower`) via the `reach` metric with `breakdown=follower_type`. If your existing sync only stores aggregate `reach`, add a follow-up sync that fetches the breakdown. **Add this to `MEDIA_FEED_METRICS` / `MEDIA_REELS_METRICS` as a separate fetch with `metric=reach&breakdown=follower_type`.** Until that lands, fall back to total `reach` and clearly label the conversion rate as "rough estimate."

### Repository function

```python
# backend/app/repositories/insights_repo.py

def find_growth_drivers(
    client: Client,
    user_id: str,
    since: datetime,
    limit: int = 10,
) -> list[dict]:
    """Return top posts ranked by attributed follower acquisition."""
    follows = client.query(
        GET_DAILY_FOLLOWS,
        parameters={"user_id": user_id, "since": since},
    ).result_rows  # [(date, daily_follows), ...]

    posts = client.query(
        GET_POSTS_FOR_ATTRIBUTION,
        parameters={"user_id": user_id, "since": since},
    ).result_rows

    # Index posts by date
    posts_by_day: dict = {}
    for p in posts:
        posts_by_day.setdefault(p[1], []).append(p)

    # Allocate follower gain proportional to non_follower_reach within the post_day → post_day+1 window
    attributions: dict[str, dict] = {}  # ig_media_id -> aggregated
    for day, daily_follows in follows:
        if daily_follows <= 0:
            continue
        # candidates: posts on (day-1) and day
        candidates = posts_by_day.get(day, []) + posts_by_day.get(day - timedelta(days=1), [])
        if not candidates:
            continue
        total_nfr = sum(p[7] or p[6] for p in candidates)  # non_follower_reach or fallback reach
        if total_nfr <= 0:
            continue
        for p in candidates:
            ig_media_id, _, permalink, thumb, caption, ptype, reach, nfr = p
            share = (nfr or reach) / total_nfr
            attributed = daily_follows * share
            agg = attributions.setdefault(ig_media_id, {
                "ig_media_id": ig_media_id, "permalink": permalink, "thumbnail_url": thumb,
                "caption": caption or "", "media_product_type": ptype,
                "reach": float(reach), "non_follower_reach": float(nfr or reach),
                "attributed_follows": 0.0,
            })
            agg["attributed_follows"] += attributed

    ranked = sorted(attributions.values(), key=lambda x: x["attributed_follows"], reverse=True)[:limit]
    for r in ranked:
        r["conversion_rate_pct"] = (r["attributed_follows"] / r["non_follower_reach"] * 100) if r["non_follower_reach"] > 0 else 0
    return ranked
```

### New endpoint

```python
# backend/app/instagram/router.py
@router.get("/insights/growth-drivers", response_model=GrowthDriversResponse)
def get_growth_drivers(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """Top posts ranked by attributed follower acquisition over the period."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_growth_drivers(client, user_id, since, limit)
    return GrowthDriversResponse(
        period_days=days,
        drivers=[GrowthDriverItem(**r) for r in rows],
    )
```

### Schemas

```python
# backend/app/instagram/schemas.py
class GrowthDriverItem(BaseModel):
    ig_media_id: str
    media_product_type: str
    permalink: str
    thumbnail_url: str | None
    caption: str
    reach: float
    non_follower_reach: float
    attributed_follows: float
    conversion_rate_pct: float

class GrowthDriversResponse(BaseModel):
    period_days: int
    drivers: list[GrowthDriverItem]
```

### Augment spikes endpoint

The existing `/insights/follower-quality/spikes` already returns suspicious spikes. Extend its response to include `candidate_drivers: list[GrowthDriverItem]` for each spike (using the same attribution model but scoped to that day's window).

### Migrations

**None required.** Same trick as F1 — pure SQL on existing tables. The only deferred piece is the optional `non_follower_reach` sync, documented above.

---

## Frontend Implementation

### Phase 1: New hook

```jsx
// src/hooks/useGrowthDrivers.js
import { usePeriodComparator } from "../context/PeriodComparatorContext";
import api from "../api/client";
import { useEffect, useState } from "react";

export function useGrowthDrivers(limit = 10) {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/instagram/insights/growth-drivers?days=${days}&limit=${limit}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || "Request failed"))
      .finally(() => setLoading(false));
  }, [days, limit]);

  return { data, loading, error };
}
```

### Phase 2: GrowthDriversTable

`src/components/audience-dna/GrowthDriversTable.jsx`:

```jsx
import { motion } from "framer-motion";
import { TrendingUp, ImageIcon, Film } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import Badge from "../shared/Badge";
import { useGrowthDrivers } from "../../hooks/useGrowthDrivers";

function TypeIcon({ type }) {
  return type === "REELS" ? <Film size={11} /> : <ImageIcon size={11} />;
}

export default function GrowthDriversTable({ onSelectPost }) {
  const { data, loading } = useGrowthDrivers(10);

  if (loading) return <SkeletonChart height="h-[320px]" />;
  const drivers = data?.drivers ?? [];

  return (
    <AnimatedCard className="p-5" delay={0.1}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-500" /> Growth Drivers
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Top posts ranked by attributed follower acquisition (24h window).
          </p>
        </div>
      </div>

      {drivers.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          No driver activity yet — needs at least 7 days of follower history.
        </p>
      ) : (
        <div className="space-y-1">
          {drivers.map((d, i) => (
            <motion.button
              key={d.ig_media_id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, type: "spring", duration: 0.4, bounce: 0 }}
              onClick={() => onSelectPost?.(d)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
            >
              <span className="w-5 text-[11px] font-mono text-slate-400 text-right shrink-0">
                #{i + 1}
              </span>
              {d.thumbnail_url ? (
                <img src={d.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge color={d.media_product_type === "REELS" ? "pink" : "violet"} icon={() => <TypeIcon type={d.media_product_type} />}>
                    {d.media_product_type === "REELS" ? "Reel" : "Post"}
                  </Badge>
                  <p className="text-xs text-slate-800 truncate">{d.caption || "(no caption)"}</p>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  reach {Math.round(d.reach).toLocaleString()} · conv {d.conversion_rate_pct.toFixed(2)}%
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-semibold text-emerald-600">
                  +{Math.round(d.attributed_follows)}
                </p>
                <p className="text-[10px] text-slate-400">followers</p>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </AnimatedCard>
  );
}
```

### Phase 3: Enhance SpikeTimeline

Existing `SpikeTimeline.jsx` already plots dots. Change behaviour:

1. When a suspicious dot is clicked, instead of an advisory toast, expand a drawer below the chart with the day's candidate drivers.
2. Add a green dot variant for **positive non-suspicious spikes** (high follows + matching high engagement, i.e., organic growth).

```jsx
// Pseudo-diff of SpikeTimeline.jsx
const onDotClick = (spike) => {
  setActiveSpike(spike);
  // fetch candidate drivers for that day
};

// Below the ScatterChart:
<AnimatePresence>
  {activeSpike && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden border-t border-slate-100 mt-4 pt-4"
    >
      <p className="text-xs font-semibold text-slate-700 mb-2">
        {activeSpike.date} · +{activeSpike.follows_change} followers
      </p>
      <SpikeCandidateList drivers={activeSpike.candidate_drivers} />
    </motion.div>
  )}
</AnimatePresence>
```

The `candidate_drivers` come from the augmented `/insights/follower-quality/spikes` response.

### Phase 4: Integrate into AudienceDNAPage

```jsx
// src/pages/AudienceDNAPage.jsx
import GrowthDriversTable from "../components/audience-dna/GrowthDriversTable";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";

export default function AudienceDNAPage() {
  const [breakdown, setBreakdown] = useState("age");
  const [selectedPost, setSelectedPost] = useState(null);

  return (
    <DashboardLayout>
      <PageHeader title="Audience DNA" emoji="👥" subtitle="…" />
      {/* breakdown toggle (existing) */}
      <QualityHeroMetrics breakdown={breakdown} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5"><QualityRadar breakdown={breakdown} /></div>
        <div className="lg:col-span-7"><CohortQualityTable breakdown={breakdown} /></div>
      </div>

      {/* NEW: Growth Drivers panel */}
      <GrowthDriversTable onSelectPost={setSelectedPost} />

      <SpikeTimeline />

      <PostInsightsDrawer media={selectedPost} onClose={() => setSelectedPost(null)} />
    </DashboardLayout>
  );
}
```

---

## Visual Design Notes

- **Conversion rate pill** — color-graded:
  - ≥ 2% → emerald
  - 0.5–2% → amber
  - < 0.5% → slate
- **Attributed-follows number** — bigger and bolder than reach, in **emerald** to signal positive growth
- **Row hover** — same `bg-slate-50` treatment as Algorithm Score top posts (consistency)
- **Rank number** — small, monospaced, slate-400 — clearly secondary

---

## Edge Cases

| Case | Handling |
|------|----------|
| User has < 7 days of follower history | Show empty state "Needs at least 7 days of follower history." |
| No posts in a +24h window of a spike | Attribution is `0` for that spike — the spike still appears in SpikeTimeline labeled "no candidate drivers" |
| All zero `non_follower_reach` | Fall back to total `reach`; show a small "rough estimate" tooltip on the conversion rate column |
| Two posts on the same day, one drives 90% of reach | Attribution model gives the dominant post 90% of the day's follows — correct behavior, but verify the UI doesn't suggest 100% causation. Tooltip on the `+follows` cell should read "attributed share" not "caused" |
| `daily_follows < 0` (net loss) | Excluded from attribution. Negative days are still plotted on the spike timeline but not counted in driver ranking |

---

## Animation Polish

| Element | Behavior |
|---------|----------|
| Rows enter | Stagger 40ms each, `initial={{ x: -6, opacity: 0 }}` |
| Click row → drawer | Existing PostInsightsDrawer pattern (reuse) |
| Conversion rate pill | Gentle pulse if ≥ 5% (rare, "wow" moments) |
| Spike-click expand | Spring height animation 0.4s |

---

## Checklist

| # | Task | File | Status |
|---|------|------|--------|
| F5.1 | BE: GET_DAILY_FOLLOWS, GET_POSTS_FOR_ATTRIBUTION queries | `backend/app/models/queries.py` | ⬜ |
| F5.2 | BE: find_growth_drivers repo function | `backend/app/repositories/insights_repo.py` | ⬜ |
| F5.3 | BE: /insights/growth-drivers endpoint | `backend/app/instagram/router.py` | ⬜ |
| F5.4 | BE: GrowthDriverItem schema | `backend/app/instagram/schemas.py` | ⬜ |
| F5.5 | BE: augment /spikes with candidate_drivers | `backend/app/instagram/router.py` | ⬜ |
| F5.6 | BE (optional): non_follower_reach sync | `backend/app/instagram/service.py` | ⬜ |
| F5.7 | FE: useGrowthDrivers hook | `frontend/src/hooks/useGrowthDrivers.js` | ⬜ |
| F5.8 | FE: GrowthDriversTable component | `frontend/src/components/audience-dna/GrowthDriversTable.jsx` | ⬜ |
| F5.9 | FE: SpikeTimeline enhanced (candidate drivers on click) | `frontend/src/components/audience-dna/SpikeTimeline.jsx` | ⬜ |
| F5.10 | FE: Wire GrowthDriversTable into AudienceDNAPage | `frontend/src/pages/AudienceDNAPage.jsx` | ⬜ |

**FE effort:** ~2 days. **BE effort:** ~3 days (5 if non_follower_reach sync is implemented). **Total:** 1 week.

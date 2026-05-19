# Tier 2 — Feature 3: Competitor Benchmarking

> **Creator question:** "How am I doing vs the accounts in my niche?"
>
> **Why it matters:** This is the single most-requested feature missing from native Insights. Every major paid tool leads with it (Iconosquare, Social Status, Socialinsider, Rival IQ). For independent creators it's the #1 reason to pay for an analytics tool.

---

## What we're building

A new top-level page at `/dashboard/competitors`:

```
┌─────────────────────────────────────────────────────────────┐
│  📈 Competitors                                              │
├──────────────────────┬──────────────────────────────────────┤
│ COMPETITOR LIST      │ SIDE-BY-SIDE METRICS                 │
│ ┌──────────────────┐ │ ┌──────────────────────────────────┐ │
│ │ @yourself  YOU   │ │ │ Followers   ER     Posts/wk Reels│ │
│ │ @rival_a  ●●●●○ │ │ │ ─────────  ────   ───────  ────  │ │
│ │ @rival_b  ●●●○○ │ │ │ You    32k   4.2%  3.5      62%  │ │
│ │ @rival_c  ●●●●● │ │ │ Niche  18k   2.8%  2.1      48%  │ │
│ │ + Add competitor │ │ │ Top    74k   6.1%  5.0      71%  │ │
│ └──────────────────┘ │ └──────────────────────────────────┘ │
├──────────────────────┴──────────────────────────────────────┤
│ FOLLOWER GROWTH OVER TIME (multi-line)                       │
│   you ── rival_a ── rival_b ── rival_c                       │
├─────────────────────────────────────────────────────────────┤
│ CONTENT MIX COMPARISON (stacked bar per account)            │
│   Reels / Carousel / Image distribution                      │
└─────────────────────────────────────────────────────────────┘
```

---

## What we can and cannot pull

### Allowed via Graph API for public Business / Creator accounts

For each handle the creator adds, we can fetch:

| Field | Source | Notes |
|-------|--------|-------|
| `username`, `name`, `biography` | `/{ig-user-id}` | One-time profile fetch |
| `profile_picture_url`, `website` | same | |
| `followers_count`, `media_count` | same | **Snapshot daily** to build a series |
| **Per-public-post** (last 25): `id, media_type, media_product_type, caption, timestamp, like_count, comments_count, permalink, thumbnail_url, media_url` | `/{ig-user-id}/media` | Engagement = (like_count + comments_count) / followers_count |

### Cannot pull (private to the account owner)

- `reach`, `impressions`, `saved`, `shares`, `total_interactions`
- Audience demographics
- Story metrics
- DM metrics
- Hashtag-search query usage by the competitor

**Engagement rate** is therefore computed as `(likes + comments) / followers_count` for competitors — note this differs from how we compute it for the authenticated user (`total_interactions / reach`). Surface this in the UI clearly so the user isn't misled.

### Ethical & ToS guardrails

- Only public Business / Creator accounts can be queried via Graph API. **Do not scrape.** Don't fetch personal accounts.
- The user must enter the competitor handle themselves; we don't auto-suggest competitors.
- Rate-limited: 4 competitors per user keeps us well within Meta's per-app quota. Hard cap at 10.

---

## Backend Changes

### Migration 012 — `competitor_handles`

```sql
-- backend/migrations/012_create_competitor_handles.sql
CREATE TABLE IF NOT EXISTS competitor_handles (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,                    -- owner of the analytics account
    handle String,                   -- lowercase, without leading @
    ig_user_id String DEFAULT '',    -- resolved on first lookup
    display_name String DEFAULT '',
    profile_picture_url String DEFAULT '',
    active UInt8 DEFAULT 1,
    added_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, handle);
```

### Migration 013 — `competitor_snapshots`

```sql
-- backend/migrations/013_create_competitor_snapshots.sql
CREATE TABLE IF NOT EXISTS competitor_snapshots (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    handle String,
    snapshot_date Date,
    followers_count UInt64,
    media_count UInt64,
    -- Aggregated from last 25 public posts at snapshot time
    posts_last_7d UInt32,
    reels_last_7d UInt32,
    carousels_last_7d UInt32,
    avg_likes_last_25 Float32,
    avg_comments_last_25 Float32,
    avg_engagement_rate_pct Float32,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, handle, snapshot_date);
```

### Resolving handle → `ig_user_id`

Meta's Business Discovery edge: `GET /{my-ig-user-id}?fields=business_discovery.username({competitor_handle}){username,name,profile_picture_url,followers_count,media_count,media.limit(25){id,media_type,media_product_type,caption,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url}}`

This **uses the authenticated user's access token** to look up a competitor's public data. There is no rate-limit cost charged to the competitor's account; it's charged against the authenticated user's app quota.

```python
# backend/app/instagram/competitors.py
import httpx
from .config import settings
from .constants import GRAPH_BASE_URL, HTTP_TIMEOUT_SECONDS

BUSINESS_DISCOVERY_FIELDS = (
    "username,name,profile_picture_url,followers_count,media_count,"
    "media.limit(25){id,media_type,media_product_type,caption,timestamp,"
    "like_count,comments_count,permalink,thumbnail_url,media_url}"
)

async def fetch_competitor_snapshot(my_ig_user_id: str, handle: str, token: str) -> dict | None:
    """Return a fresh snapshot for the competitor handle, or None if not findable."""
    url = f"{GRAPH_BASE_URL}/{my_ig_user_id}"
    params = {
        "fields": f"business_discovery.username({handle}){{{BUSINESS_DISCOVERY_FIELDS}}}",
        "access_token": token,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(url, params=params)
        if resp.status_code == 400:
            return None  # Handle not found or not a Business/Creator account
        resp.raise_for_status()
        return resp.json().get("business_discovery")
```

### Daily snapshot job

```python
# backend/app/jobs/competitor_sync.py
"""Daily cron. For every active competitor handle, fetch latest snapshot."""
import asyncio
from datetime import date, datetime
from app.database import get_client
from app.crypto import decrypt_token
from app.config import settings
from app.instagram.competitors import fetch_competitor_snapshot

async def main():
    client = get_client()
    # Get all active (user, handle) tuples and the user's token
    rows = client.query("""
        SELECT c.user_id, c.handle, p.ig_user_id, p.access_token
        FROM competitor_handles c FINAL
        INNER JOIN instagram_profiles p FINAL ON c.user_id = p.user_id
        WHERE c.active = 1
    """).result_rows

    today = date.today()
    snapshot_rows = []
    for user_id, handle, ig_user_id, enc_token in rows:
        token = decrypt_token(enc_token, settings.jwt_secret_key)
        try:
            snap = await fetch_competitor_snapshot(ig_user_id, handle, token)
        except Exception as e:
            logger.warning("competitor sync failed for %s: %s", handle, e)
            continue
        if not snap:
            continue
        media = snap.get("media", {}).get("data", [])
        last_7d = [m for m in media if _is_within_days(m["timestamp"], 7)]
        snapshot_rows.append([
            str(uuid.uuid4()), user_id, handle, today,
            snap["followers_count"], snap["media_count"],
            len(last_7d),
            sum(1 for m in last_7d if m.get("media_product_type") == "REELS"),
            sum(1 for m in last_7d if m.get("media_type") == "CAROUSEL_ALBUM"),
            _avg([m.get("like_count", 0) for m in media]),
            _avg([m.get("comments_count", 0) for m in media]),
            _engagement_rate(media, snap["followers_count"]),
            datetime.utcnow(),
        ])
    if snapshot_rows:
        client.insert("competitor_snapshots", snapshot_rows, column_names=[...])

if __name__ == "__main__":
    asyncio.run(main())
```

### Endpoints

```python
# backend/app/instagram/router.py

@router.get("/competitors", response_model=CompetitorListResponse)
def list_competitors(current_user: User = Depends(get_current_user)):
    """List the user's tracked competitor handles + their latest snapshots."""
    ...

@router.post("/competitors", response_model=CompetitorItem)
async def add_competitor(
    payload: AddCompetitorRequest,
    current_user: User = Depends(get_current_user),
):
    """Add a handle. Validates via Business Discovery and saves an initial snapshot."""
    # Hard cap: max 10 active competitors per user
    # Returns the resolved profile fields + first snapshot
    ...

@router.delete("/competitors/{handle}", status_code=204)
def remove_competitor(handle: str, current_user: User = Depends(get_current_user)):
    """Soft-delete (active = 0)."""
    ...

@router.get("/competitors/timeline", response_model=CompetitorTimelineResponse)
def get_competitor_timeline(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Daily follower & engagement series for every active competitor + the user themselves."""
    ...

@router.get("/competitors/content-mix", response_model=ContentMixResponse)
def get_competitor_content_mix(
    days: int = Query(30, ge=7, le=180),
    current_user: User = Depends(get_current_user),
):
    """Reels / Carousel / Image distribution per competitor over the period."""
    ...
```

### Schemas

```python
# backend/app/instagram/schemas.py
class AddCompetitorRequest(BaseModel):
    handle: str = Field(..., min_length=1, max_length=30, pattern=r"^[A-Za-z0-9._]+$")

class CompetitorSnapshot(BaseModel):
    handle: str
    snapshot_date: date
    followers_count: int
    media_count: int
    posts_last_7d: int
    reels_last_7d: int
    carousels_last_7d: int
    avg_engagement_rate_pct: float

class CompetitorItem(BaseModel):
    handle: str
    ig_user_id: str
    display_name: str
    profile_picture_url: str
    latest_snapshot: CompetitorSnapshot | None

class CompetitorListResponse(BaseModel):
    competitors: list[CompetitorItem]
    you: CompetitorSnapshot  # the authenticated user's equivalent metrics
```

---

## Frontend Implementation

### Phase 1: New route + page shell

```jsx
// src/App.jsx — add route
<Route path="/dashboard/competitors" element={<ProtectedRoute><CompetitorsPage /></ProtectedRoute>} />
```

```jsx
// src/pages/CompetitorsPage.jsx
import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import CompetitorListPanel from "../components/competitors/CompetitorListPanel";
import CompetitorMetricsTable from "../components/competitors/CompetitorMetricsTable";
import CompetitorTimelineChart from "../components/competitors/CompetitorTimelineChart";
import ContentMixChart from "../components/competitors/ContentMixChart";
import AddCompetitorDialog from "../components/competitors/AddCompetitorDialog";

export default function CompetitorsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <DashboardLayout>
      <PageHeader
        title="Competitors"
        emoji="📈"
        subtitle="Track public benchmarks across accounts in your niche."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            <CompetitorListPanel onAdd={() => setAddOpen(true)} />
          </div>
          <div className="lg:col-span-8">
            <CompetitorMetricsTable />
          </div>
        </div>
        <CompetitorTimelineChart />
        <ContentMixChart />
      </div>

      <AddCompetitorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </DashboardLayout>
  );
}
```

### Phase 2: Hooks

```jsx
// src/hooks/useCompetitors.js
import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

export function useCompetitors() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.get("/instagram/competitors")
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (handle) => {
    await api.post("/instagram/competitors", { handle });
    refresh();
  }, [refresh]);

  const remove = useCallback(async (handle) => {
    await api.delete(`/instagram/competitors/${encodeURIComponent(handle)}`);
    refresh();
  }, [refresh]);

  return { data, loading, refresh, add, remove };
}

export function useCompetitorTimeline() {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/instagram/competitors/timeline?days=${days}`).then((r) => setData(r.data));
  }, [days]);
  return data;
}

export function useContentMix() {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/instagram/competitors/content-mix?days=${days}`).then((r) => setData(r.data));
  }, [days]);
  return data;
}
```

### Phase 3: CompetitorListPanel

`src/components/competitors/CompetitorListPanel.jsx`:

```jsx
import { motion } from "framer-motion";
import { Plus, X, Star } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { useCompetitors } from "../../hooks/useCompetitors";

export default function CompetitorListPanel({ onAdd }) {
  const { data, loading, remove } = useCompetitors();
  if (loading) return null;
  const list = data?.competitors ?? [];

  return (
    <AnimatedCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Tracking</h3>
        <button onClick={onAdd} className="text-[11px] flex items-center gap-1 text-violet-600 font-medium hover:text-violet-700">
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="space-y-1">
        {/* You first */}
        <div className="flex items-center gap-3 p-2 rounded-lg bg-violet-50 border border-violet-200">
          <Star size={14} className="text-violet-500" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-violet-800">You</p>
            <p className="text-[10px] text-violet-600 font-mono">{data?.you?.followers_count?.toLocaleString()} followers</p>
          </div>
        </div>

        {list.map((c, i) => (
          <motion.div
            key={c.handle}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 group"
          >
            {c.profile_picture_url ? (
              <img src={c.profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-100" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-800 truncate">@{c.handle}</p>
              <p className="text-[10px] text-slate-400 font-mono">
                {c.latest_snapshot?.followers_count?.toLocaleString() ?? "—"}
              </p>
            </div>
            <button
              onClick={() => remove(c.handle)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}

        {list.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            Add up to 10 competitors.
          </p>
        )}
      </div>
    </AnimatedCard>
  );
}
```

### Phase 4: AddCompetitorDialog

Modal with handle input. On submit, calls `add()` from the hook; validates client-side that the handle matches `^[A-Za-z0-9._]+$` and is ≤ 30 chars.

```jsx
// src/components/competitors/AddCompetitorDialog.jsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { useCompetitors } from "../../hooks/useCompetitors";

export default function AddCompetitorDialog({ open, onClose }) {
  const { add } = useCompetitors();
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const clean = handle.replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(clean)) {
      setError("Invalid handle.");
      return;
    }
    setSubmitting(true);
    try {
      await add(clean);
      setHandle("");
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't add this account. Must be a public Business/Creator account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Add competitor</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Instagram handle</span>
                <input
                  autoFocus
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@handle"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 text-sm"
                />
              </label>
              <p className="text-[11px] text-slate-400">
                Must be a public Business or Creator account. Private and personal accounts cannot be tracked.
              </p>
              {error && <p className="text-xs text-rose-500">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Add competitor
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Phase 5: CompetitorMetricsTable

Side-by-side numbers. Highlights where you are leading vs trailing the niche median.

```jsx
// src/components/competitors/CompetitorMetricsTable.jsx
import AnimatedCard from "../shared/AnimatedCard";
import { useCompetitors } from "../../hooks/useCompetitors";

const COLS = [
  { key: "followers_count",         label: "Followers",  fmt: (v) => v?.toLocaleString() ?? "—" },
  { key: "avg_engagement_rate_pct", label: "Eng. rate",  fmt: (v) => `${v?.toFixed(1) ?? "—"}%` },
  { key: "posts_last_7d",           label: "Posts/wk",   fmt: (v) => v ?? "—" },
  { key: "reels_last_7d",           label: "Reels/wk",   fmt: (v) => v ?? "—" },
];

export default function CompetitorMetricsTable() {
  const { data } = useCompetitors();
  if (!data) return null;
  const rows = [{ handle: "You", _is_self: true, ...data.you }, ...data.competitors.map((c) => ({ handle: c.handle, ...c.latest_snapshot }))];

  // Niche median per column (excluding self)
  const median = (k) => {
    const xs = data.competitors.map((c) => c.latest_snapshot?.[k]).filter((v) => v != null).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  };
  const medians = Object.fromEntries(COLS.map((c) => [c.key, median(c.key)]));

  return (
    <AnimatedCard className="p-5" delay={0.05}>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Side-by-side metrics</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="text-left py-2 pr-4">Account</th>
              {COLS.map((c) => <th key={c.key} className="text-right py-2 px-3">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.handle} className={r._is_self ? "bg-violet-50/50 font-medium" : ""}>
                <td className="py-2 pr-4 text-xs">
                  {r._is_self ? <span className="text-violet-700">You</span> : `@${r.handle}`}
                </td>
                {COLS.map((c) => {
                  const v = r[c.key];
                  const m = medians[c.key];
                  const aboveMedian = !r._is_self ? false : (v != null && m != null && v > m);
                  return (
                    <td key={c.key} className={`text-right py-2 px-3 text-xs font-mono ${aboveMedian ? "text-emerald-700 font-semibold" : "text-slate-700"}`}>
                      {c.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 mt-3">
        Competitor engagement is computed as (likes + comments) / followers from public posts. Your engagement uses reach-based total interactions — values are not directly comparable. Niche median highlighted.
      </p>
    </AnimatedCard>
  );
}
```

### Phase 6: CompetitorTimelineChart

Multi-line follower-growth chart using `useCompetitorTimeline()`. Recharts `LineChart` with one `<Line>` per handle (including the user). Color palette: violet (you) + 4 distinct hues for competitors. Tooltip groups by date.

### Phase 7: ContentMixChart

Stacked horizontal bar — one bar per account, segments for Reels / Carousel / Image. Uses `useContentMix()`. Reels segment in pink (`#ec4899`), Carousel in violet (`#8b5cf6`), Image in slate (`#94a3b8`).

---

## Edge Cases

| Case | Handling |
|------|----------|
| User tries to add a private or personal account | Backend returns 400 with `detail: "Account is not a public Business or Creator account."` Surface that message verbatim in the dialog. |
| User exceeds 10 active competitors | Backend rejects. Frontend hides "Add" button once 10 are present. |
| User changes IG handle | Snapshot job continues using stored `handle`. Display name may go stale; refresh on next sync. |
| Competitor becomes private | Snapshot returns 400 from Graph; mark `active = 0` after 3 consecutive failures and surface a small "no longer trackable" indicator. |
| First snapshot is on a Tuesday, no history yet | Timeline chart shows a single dot. After 7 days, it becomes meaningful. Show a small banner: "Tracking since X — comparisons get better with more history." |
| Engagement rate definitions differ (you vs them) | Disclaimed in the table footer. Don't ever show "you are X% behind" — show the raw numbers and let the user infer. |
| Rate-limit error from Graph | Skip this competitor for that day; retry next snapshot. |
| User removes a competitor | Soft delete (`active = 0`). Snapshots stay for historical lookback up to retention policy. Add a "Restore" surface in settings (optional). |

---

## Operational Notes

- **Job schedule:** `competitor_sync` runs once daily at 04:00 UTC. ~1 second per competitor = trivial.
- **Cost:** No incremental API cost (it's the user's existing token).
- **Quota:** Each user uses their own Meta app quota. With 10 competitors × daily snapshot = 10 calls/day per user. Well within the per-app quota.
- **Privacy:** Display name + profile picture are public; storage is fine. Do not store private fields.

---

## Animation Polish

| Element | Behavior |
|---------|----------|
| Add dialog enter | Spring scale-in 0.96 → 1.0 with backdrop-blur, 0.35s |
| Competitor row removal | Layout animation (`AnimatePresence`) — row collapses + neighbors shift up |
| Timeline lines | Path-draw left-to-right on first render (`drawLine` keyframe), staggered 120ms per line |
| Above-median cell | Subtle highlight pulse on first appearance |

---

## Checklist

| # | Task | File | Status |
|---|------|------|--------|
| F3.1 | BE: migration 012 (competitor_handles) | `backend/migrations/012_create_competitor_handles.sql` | ⬜ |
| F3.2 | BE: migration 013 (competitor_snapshots) | `backend/migrations/013_create_competitor_snapshots.sql` | ⬜ |
| F3.3 | BE: competitors.py (business discovery wrapper) | `backend/app/instagram/competitors.py` | ⬜ |
| F3.4 | BE: competitor_sync job | `backend/app/jobs/competitor_sync.py` | ⬜ |
| F3.5 | BE: schedule daily run | infra | ⬜ |
| F3.6 | BE: 5 endpoints (list / add / remove / timeline / content-mix) | `backend/app/instagram/router.py` | ⬜ |
| F3.7 | BE: schemas | `backend/app/instagram/schemas.py` | ⬜ |
| F3.8 | FE: route + sidebar entry | `App.jsx`, `DashboardSidebar.jsx` | ⬜ |
| F3.9 | FE: useCompetitors / useCompetitorTimeline / useContentMix hooks | `hooks/useCompetitors.js` | ⬜ |
| F3.10 | FE: CompetitorsPage shell | `pages/CompetitorsPage.jsx` | ⬜ |
| F3.11 | FE: CompetitorListPanel | `components/competitors/CompetitorListPanel.jsx` | ⬜ |
| F3.12 | FE: AddCompetitorDialog | `components/competitors/AddCompetitorDialog.jsx` | ⬜ |
| F3.13 | FE: CompetitorMetricsTable | `components/competitors/CompetitorMetricsTable.jsx` | ⬜ |
| F3.14 | FE: CompetitorTimelineChart | `components/competitors/CompetitorTimelineChart.jsx` | ⬜ |
| F3.15 | FE: ContentMixChart | `components/competitors/ContentMixChart.jsx` | ⬜ |

**FE effort:** ~7 days. **BE effort:** ~8 days. **Total:** 3 weeks.

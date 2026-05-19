# Tier 2 — Feature 1: Period-over-Period Comparisons

> **Creator question:** "How am I doing **this** month vs **last** month? Same month last year?"
>
> **Why it matters:** Native Instagram Insights cuts off at 90 days. ClickHouse retains everything. This is the single largest moat over the native app — exposed correctly, it's a one-shot reason to keep using the dashboard.

---

## What we're building

Every metric card and chart in the dashboard gets:

1. A **second value** (the comparison period's number)
2. A **percent delta** with direction
3. A **significance indicator** (don't show "+3%" as good news if it's noise)
4. A **sparkline overlay** showing both periods on the same axis (when relevant)

There is also a global **PeriodComparatorBar** above each page that lets the user pick the comparison:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Last 30 days  ▼     Compare to  ┌───────────────────────────────┐  │
│                                  │ ○ Off  ● Prev 30 days  ○ Y/Y  │  │
│                                  │ ○ Custom…                      │  │
│                                  └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Backend Changes

### Endpoint convention

Every existing insights endpoint gains an **optional** `compare_to` query parameter:

| Value | Meaning |
|-------|---------|
| *(omitted)* | No comparison — returns current period only (backward compatible) |
| `prev_period` | Same length immediately prior (e.g., last 30d → prior 30d) |
| `prev_year` | Same date range one year earlier |
| `YYYY-MM-DD,YYYY-MM-DD` | Custom range |

Response shape extends current schema:

```python
class ComparisonValue(BaseModel):
    current: float
    prior: float | None = None
    delta_pct: float | None = None
    significant: bool | None = None
```

Routes that today return scalar metrics (e.g., `OverviewResponse`) replace each metric field with a `ComparisonValue` when `compare_to` is set, otherwise leave it as a plain number. Routes that return time-series (`FollowerGrowthChart`, `EngagementChart`) return **two** series side-by-side keyed `current` and `prior`.

### Repository layer

Add a thin wrapper that runs each existing query twice with different `since/until` windows and merges the results. Centralize this in `repositories/comparison.py`:

```python
# backend/app/repositories/comparison.py
from datetime import datetime, timedelta
from typing import Callable, TypeVar

T = TypeVar("T")

def resolve_compare_window(
    compare_to: str | None,
    since: datetime,
    until: datetime,
) -> tuple[datetime, datetime] | None:
    if compare_to is None:
        return None
    length = until - since
    if compare_to == "prev_period":
        return (since - length, since)
    if compare_to == "prev_year":
        return (since - timedelta(days=365), until - timedelta(days=365))
    # custom: "YYYY-MM-DD,YYYY-MM-DD"
    a, b = compare_to.split(",")
    return (datetime.fromisoformat(a), datetime.fromisoformat(b))


def with_comparison(
    fn: Callable[[datetime, datetime], T],
    since: datetime,
    until: datetime,
    compare_to: str | None,
) -> tuple[T, T | None]:
    current = fn(since, until)
    prior = None
    win = resolve_compare_window(compare_to, since, until)
    if win:
        prior = fn(*win)
    return current, prior
```

Update existing routes (e.g., `/insights/overview`) to use this helper:

```python
@router.get("/insights/overview", response_model=OverviewResponse)
def get_overview(
    days: int = Query(30, ge=1, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    compare_to: str | None = Query(None, pattern=r"^(prev_period|prev_year|\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2})$"),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)

    cur, prior = with_comparison(
        lambda a, b: insights_repo.find_account_overview(client, user_id, a, b),
        since, until, compare_to,
    )
    return build_overview_response(cur, prior)
```

### Significance flag

The backend computes the `significant` flag using Welch's t-test or, for ratio metrics (engagement rate, save rate), a 2-proportion z-test. Place the math in `app/stats.py` so it can be unit-tested:

```python
# backend/app/stats.py
import math

def two_prop_z(p1: float, n1: int, p2: float, n2: int) -> float:
    if n1 < 30 or n2 < 30:
        return 0.0
    p = (p1 * n1 + p2 * n2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1/n1 + 1/n2))
    if se == 0:
        return 0.0
    return (p1 - p2) / se

def is_significant(z: float) -> bool:
    return abs(z) >= 1.96  # 95% two-tailed
```

### Migrations

**None required.** Period-over-period is pure SQL on existing tables.

---

## Frontend Implementation

### Phase 1: PeriodComparatorContext (shared infra — already in overview doc)

`src/context/PeriodComparatorContext.jsx`:

```jsx
import { createContext, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function PeriodComparatorProvider({ children }) {
  const [days, setDays] = useState(30);
  const [compareMode, setCompareMode] = useState(null);
  const [customRange, setCustomRange] = useState(null);

  const compareTo = useMemo(() => {
    if (compareMode === null) return null;
    if (compareMode === "prev_period" || compareMode === "prev_year") return compareMode;
    if (compareMode === "custom" && customRange) {
      return `${customRange.from},${customRange.to}`;
    }
    return null;
  }, [compareMode, customRange]);

  const value = useMemo(
    () => ({ days, setDays, compareMode, setCompareMode, customRange, setCustomRange, compareTo }),
    [days, compareMode, customRange, compareTo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePeriodComparator = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePeriodComparator must be inside provider");
  return ctx;
};
```

Wrap `DashboardLayout`'s main area:

```jsx
// src/components/DashboardLayout.jsx
import { PeriodComparatorProvider } from "../context/PeriodComparatorContext";

export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-root">
      <Navbar />
      <PeriodComparatorProvider>
        <div className="dashboard-content flex max-w-[1440px] mx-auto">
          <DashboardSidebar />
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </PeriodComparatorProvider>
    </div>
  );
}
```

### Phase 2: PeriodComparatorBar

`src/components/shared/PeriodComparatorBar.jsx` — replaces the existing `PeriodSelector` in `PageHeader`. Spring-animated chip group, motion `layoutId` on the active chip.

```jsx
import { motion } from "framer-motion";
import { Calendar, GitCompare } from "lucide-react";
import { usePeriodComparator } from "../../context/PeriodComparatorContext";

const DAY_OPTS = [7, 30, 90, 180, 365];
const COMPARE_OPTS = [
  { value: null,          label: "Off" },
  { value: "prev_period", label: "Prev period" },
  { value: "prev_year",   label: "Y/Y" },
];

export default function PeriodComparatorBar() {
  const { days, setDays, compareMode, setCompareMode } = usePeriodComparator();

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Period picker */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
        {DAY_OPTS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="relative px-3 py-1.5 text-[11px] font-medium"
          >
            {days === d && (
              <motion.span
                layoutId="period-active"
                className="absolute inset-0 rounded-md bg-white shadow-sm"
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              />
            )}
            <span className={`relative ${days === d ? "text-slate-800" : "text-slate-500"}`}>
              {d === 365 ? "1y" : `${d}d`}
            </span>
          </button>
        ))}
      </div>

      {/* Compare picker */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <GitCompare size={12} />
        <span>Compare to</span>
      </div>
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
        {COMPARE_OPTS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => setCompareMode(opt.value)}
            className="relative px-3 py-1.5 text-[11px] font-medium"
          >
            {compareMode === opt.value && (
              <motion.span
                layoutId="compare-active"
                className="absolute inset-0 rounded-md bg-white shadow-sm"
                transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              />
            )}
            <span className={`relative ${compareMode === opt.value ? "text-slate-800" : "text-slate-500"}`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

Update `PageHeader` to use this in place of the old `PeriodSelector`. Drop the `days`/`onDaysChange` props — they come from context now.

### Phase 3: ComparisonMetricPill

Extends `MetricPill` to render the second value + significance dot.

`src/components/shared/ComparisonMetricPill.jsx`:

```jsx
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";

function AnimatedNumber({ value, decimals = 0, suffix = "" }) {
  const spring = useSpring(0, { duration: 800, bounce: 0 });
  const display = useTransform(spring, (v) => `${v.toFixed(decimals)}${suffix}`);
  const ref = useRef(null);
  useEffect(() => { spring.set(value); }, [value, spring]);
  return <motion.span ref={ref}>{display}</motion.span>;
}

export default function ComparisonMetricPill({ label, value, prior, deltaPct, significant, decimals = 0, suffix = "" }) {
  const hasCompare = prior !== undefined && prior !== null;
  const deltaColor = !hasCompare ? "text-slate-400"
                    : deltaPct > 0 ? "text-emerald-600"
                    : deltaPct < 0 ? "text-rose-500"
                    : "text-slate-400";
  const DeltaIcon = !hasCompare ? Minus : deltaPct > 0 ? TrendingUp : deltaPct < 0 ? TrendingDown : Minus;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="metric-value text-2xl">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </span>
      {hasCompare && (
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs font-medium ${deltaColor}`}>
            <DeltaIcon size={12} />
            {isFinite(deltaPct) ? `${Math.abs(deltaPct).toFixed(1)}%` : "—"}
          </span>
          <span className="text-[10px] text-slate-400">
            from {prior.toFixed(decimals)}{suffix}
          </span>
          {significant && (
            <span className="flex items-center gap-0.5 text-[10px] text-violet-600 font-semibold">
              <Sparkles size={10} /> sig.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

### Phase 4: Update hooks to pass `compareTo`

Add `compareTo` to every existing Tier 1 hook by reading from context. Example for `useFormatBreakdown`:

```jsx
// src/hooks/useTier1Insights.js
import { usePeriodComparator } from "../context/PeriodComparatorContext";

export function useFormatBreakdown() {
  const { days, compareTo } = usePeriodComparator();
  const url = compareTo
    ? `/instagram/insights/format-breakdown?days=${days}&compare_to=${encodeURIComponent(compareTo)}`
    : `/instagram/insights/format-breakdown?days=${days}`;
  return useFetch(url, [days, compareTo]);
}
```

The `days` prop is removed from every page's call-site — pages no longer need to thread it.

### Phase 5: Dual-series charts

For time-series charts (Engagement, Follower Growth, Hook Strength Trend), when `compareTo` is set, the BE returns:

```json
{
  "current":  [{ "x": "2026-04-15", "y": 1234 }, ...],
  "prior":    [{ "x": "2026-03-16", "y": 980 }, ...]
}
```

Chart components render two `<Line>` (or `<Area>`) elements — current solid, prior dashed and 40% opacity. **Both share the same X-axis** by index, not date, so a 30-day period overlays a prior 30-day period on a `1..30` axis with two labels rows ("Current: Apr 15 → May 14" / "Prior: Mar 16 → Apr 14"). Example for `EngagementChart`:

```jsx
<LineChart data={merged}>
  <XAxis dataKey="idx" tickFormatter={(i) => `+${i}d`} />
  <Line
    dataKey="current_engagement"
    stroke="#8b5cf6"
    strokeWidth={2}
    dot={false}
  />
  {compareTo && (
    <Line
      dataKey="prior_engagement"
      stroke="#8b5cf6"
      strokeWidth={1.5}
      strokeDasharray="4 4"
      strokeOpacity={0.4}
      dot={false}
    />
  )}
</LineChart>
```

Where `merged` zips current + prior arrays by index:

```js
const merged = useMemo(() => {
  if (!data) return [];
  return data.current.map((c, i) => ({
    idx: i,
    current_engagement: c.y,
    prior_engagement: data.prior?.[i]?.y ?? null,
  }));
}, [data]);
```

### Phase 6: Page integration

Drop the local `const [days, setDays] = useState(30)` from each page and replace `<PageHeader days=… onDaysChange=…>` with `<PageHeader>` + `<PeriodComparatorBar />` rendered inside the header. Then swap every `<MetricPill>` in `HeroCards.jsx`, `ReelsHeroMetrics.jsx`, `QualityHeroMetrics.jsx` for `<ComparisonMetricPill>` and feed it `value`, `prior`, `deltaPct`, `significant` from the API.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Comparison period predates the user's data | API returns `prior: null`. UI shows "— vs first period" instead of a delta. |
| User picks `prev_year` but only has 6 months of history | Same as above. The migration to ClickHouse mid-2024 means many users will see this for a while. |
| Period A is 30d but comparison is set to `custom` of 45d | API normalizes by **rate** (per-day average) when shapes differ. Flag in UI: "comparing rates per day, not totals." |
| The metric is a ratio (engagement rate %), not a count | `significant` uses 2-prop z-test. Engagement counts use Welch's t. |
| Sub-3-day periods | Don't compute significance. Show "—" with tooltip "need ≥ 3 days of data." |
| Mobile (< 640px) | Comparator bar collapses to a single icon button → bottom-sheet on tap. |

---

## Animation Polish

| Element | Behavior |
|---------|----------|
| Period chip swap | `layoutId="period-active"` FLIP — spring 0.35s, bounce 0 |
| Compare-mode chip swap | Same |
| Card delta appears | When `compareMode` flips from null → non-null, the delta row springs in with `initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}` |
| Prior line on chart | Path draws from left to right on first render: `strokeDasharray` + `strokeDashoffset` animation, 0.6s |
| Significance sparkle | Subtle pulse animation on the "sig." badge (existing keyframe `pulseGlow`) |

---

## Checklist

| # | Task | File | Status |
|---|------|------|--------|
| F1.1 | PeriodComparatorContext + provider | `context/PeriodComparatorContext.jsx` | ⬜ |
| F1.2 | Mount provider in DashboardLayout | `components/DashboardLayout.jsx` | ⬜ |
| F1.3 | PeriodComparatorBar component | `components/shared/PeriodComparatorBar.jsx` | ⬜ |
| F1.4 | Replace PeriodSelector usage in PageHeader | `components/shared/PageHeader.jsx` | ⬜ |
| F1.5 | ComparisonMetricPill | `components/shared/ComparisonMetricPill.jsx` | ⬜ |
| F1.6 | stats.js helper (pctDelta, significance) | `utils/stats.js` | ⬜ |
| F1.7 | Update useTier1Insights hooks for compareTo | `hooks/useTier1Insights.js` | ⬜ |
| F1.8 | Swap MetricPill → ComparisonMetricPill across HeroCards / Reels / Audience | 3 files | ⬜ |
| F1.9 | Dual-series rendering in EngagementChart | `components/dashboard/EngagementChart.jsx` | ⬜ |
| F1.10 | Dual-series rendering in FollowerGrowthChart | `components/dashboard/FollowerGrowthChart.jsx` | ⬜ |
| F1.11 | Dual-series rendering in HookStrengthTrend | `components/reels-studio/HookStrengthTrend.jsx` | ⬜ |
| F1.12 | BE: comparison helper module | `backend/app/repositories/comparison.py` | ⬜ |
| F1.13 | BE: stats module (z-test, t-test) | `backend/app/stats.py` | ⬜ |
| F1.14 | BE: add compare_to to overview / dashboard / format-breakdown / algorithm-metrics / follower-growth / engagement / reels-trend | `instagram/router.py` + matching SQL | ⬜ |
| F1.15 | BE: schema additions (ComparisonValue) | `instagram/schemas.py` | ⬜ |

**FE effort:** ~3 days. **BE effort:** ~2 days. **Total:** 1 week.

# Frontend Implementation Plan — Part 2
## Content Lab Page + Reels Studio Page

---

## Content Lab Page (`/dashboard/content`)

> **Creator question:** "What content format works best for me, when should I post, and which posts does the algorithm love?"

### Layout: 3-Section Bento Grid

```
┌─────────────────────────────────────────────────┐
│  PageHeader: "Content Lab" 🧪                   │
├────────────────────────┬────────────────────────┤
│  FORMAT BREAKDOWN      │  ALGORITHM SCORE        │
│  (Stacked bar chart    │  (Radial gauge +        │
│   with drill-down)     │   top posts list)       │
│  DrillDownChart        │  AnimatedCard           │
│  L1: By format         │                         │
│  L2: Click → per-post  │                         │
├────────────────────────┴────────────────────────┤
│  BEST TIME HEATMAP                               │
│  (7×24 grid, day-of-week × hour, color = rate)  │
│  Click cell → shows posts from that slot         │
└─────────────────────────────────────────────────┘
```

### Task 4.1 — ContentLabPage Shell

**File:** Create `src/pages/ContentLabPage.jsx`

```jsx
import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import FormatBreakdownChart from "../components/content-lab/FormatBreakdownChart";
import AlgorithmScorePanel from "../components/content-lab/AlgorithmScorePanel";
import BestTimeHeatmap from "../components/content-lab/BestTimeHeatmap";
import SyncButton from "../components/dashboard/SyncButton";

export default function ContentLabPage() {
  const [days, setDays] = useState(90);

  return (
    <DashboardLayout>
      <PageHeader
        title="Content Lab"
        emoji="🧪"
        subtitle="Discover which formats, times, and styles the algorithm rewards most."
        days={days}
        onDaysChange={setDays}
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        {/* Row 1: Format breakdown + Algorithm score */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <FormatBreakdownChart days={days} />
          </div>
          <div className="lg:col-span-5">
            <AlgorithmScorePanel days={days} />
          </div>
        </div>

        {/* Row 2: Best time heatmap (full width) */}
        <BestTimeHeatmap days={days} />
      </div>
    </DashboardLayout>
  );
}
```

### Task 4.2 — FormatBreakdownChart (Drill-Down)

Interactive horizontal bar chart. **Click a format bar → drills into per-post view.**

**File:** Create `src/components/content-lab/FormatBreakdownChart.jsx`

Key behaviors:
- **Level 1:** Horizontal bars comparing REELS vs FEED vs CAROUSEL by engagement rate
- Each bar shows avg engagement rate, save rate, share rate as stacked segments
- Bars use pastel card colors (`card-lavender`, `card-pink`, `card-peach`)
- **Level 2 (drill):** Click a format → show top posts of that format ranked by algorithm score
- Uses `DrillDownChart` wrapper from shared components
- Recharts `BarChart` with `layout="vertical"`, rounded bars, custom tooltip

```jsx
// Recharts config for Level 1
<BarChart layout="vertical" data={formats} barSize={28} barGap={8}>
  <XAxis type="number" domain={[0, "auto"]} tickFormatter={(v) => `${v}%`} />
  <YAxis type="category" dataKey="label" width={100} />
  <Tooltip content={<CustomFormatTooltip />} />
  <Bar dataKey="avg_engagement_rate_pct" fill="#8b5cf6" radius={[0, 6, 6, 0]}
    onClick={(data) => onDrill(data.media_product_type)}
    cursor="pointer"
  />
</BarChart>
```

**Custom tooltip** shows all rates in a glassmorphic card:
```
┌─────────────────────┐
│ REELS               │
│ 24 posts            │
│ ───────────────     │
│ Engagement  4.2%    │
│ Save Rate   2.1%  ↑ │
│ Share Rate  1.8%  ↑ │
│ ───────────────     │
│ Click to explore →  │
└─────────────────────┘
```

### Task 4.3 — AlgorithmScorePanel

Shows the composite algorithm score as a radial gauge + ranked post list.

**File:** Create `src/components/content-lab/AlgorithmScorePanel.jsx`

Key behaviors:
- **Top:** Animated radial gauge (SVG circle with stroke-dasharray animation)
- Score 0–10 with color gradient (red → amber → green)
- **Below:** Top 5 posts by algorithm_score as mini cards with thumbnail + score pill
- Each post card is clickable → opens `PostInsightsDrawer`
- Uses `useAlgorithmMetrics()` and `useAlgorithmPosts()` hooks

### Task 4.4 — BestTimeHeatmap (Interactive Grid)

7-row × 24-col grid where color intensity = engagement rate.

**File:** Create `src/components/content-lab/BestTimeHeatmap.jsx`

Key behaviors:
- Grid cells colored with `oklch` interpolation from slate-50 (low) to violet-500 (high)
- **Hover cell:** Shows tooltip with sample size + avg engagement rate
- **Click cell:** Expands to show posts published in that slot
- Row labels: Mon–Sun. Column labels: 12am–11pm (every 3h shown)
- Format toggle pill: "All" | "Reels" | "Feed" (filters `by_format` data)
- Top 3 cells get a subtle pulse animation (the "sweet spots")

```jsx
// Cell color computation
const getColor = (rate, maxRate) => {
  const t = maxRate > 0 ? rate / maxRate : 0;
  const lightness = 0.95 - t * 0.45;  // 0.95 (empty) → 0.50 (hot)
  const chroma = t * 0.22;
  return `oklch(${lightness} ${chroma} 275)`;
};
```

---

## Reels Studio Page (`/dashboard/reels`)

> **Creator question:** "Are my hooks working? Which Reels keep people watching?"

### Layout

```
┌─────────────────────────────────────────────────┐
│  PageHeader: "Reels Studio" 🎬                  │
├─────────┬──────────┬───────────┬───────────────┤
│ AVG HOOK│ AVG WATCH│ TOP SKIP  │ REPLAY RATE   │
│ STRENGTH│ TIME     │ RATE      │               │
│ MetricPill cards (4 across)                     │
├─────────────────────────────────────────────────┤
│  HOOK STRENGTH TREND (Area chart, weekly)       │
│  with gradient fill, shows improvement over time│
├─────────────────────────────────────────────────┤
│  REEL-BY-REEL TABLE                             │
│  Sortable columns: Hook%, Watch Time, Replays   │
│  Thumbnail + caption preview                     │
│  Click row → PostInsightsDrawer                  │
└─────────────────────────────────────────────────┘
```

### Task 5.1 — ReelsStudioPage Shell

**File:** Create `src/pages/ReelsStudioPage.jsx`

```jsx
import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import ReelsHeroMetrics from "../components/reels-studio/ReelsHeroMetrics";
import HookStrengthTrend from "../components/reels-studio/HookStrengthTrend";
import ReelsRetentionTable from "../components/reels-studio/ReelsRetentionTable";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import SyncButton from "../components/dashboard/SyncButton";

export default function ReelsStudioPage() {
  const [days, setDays] = useState(90);
  const [selectedMedia, setSelectedMedia] = useState(null);

  return (
    <DashboardLayout>
      <PageHeader
        title="Reels Studio"
        emoji="🎬"
        subtitle="Track hook strength, watch time, and retention across all your Reels."
        days={days}
        onDaysChange={setDays}
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        <ReelsHeroMetrics days={days} />
        <HookStrengthTrend days={days} />
        <ReelsRetentionTable days={days} onSelect={setSelectedMedia} />
      </div>

      <PostInsightsDrawer media={selectedMedia} onClose={() => setSelectedMedia(null)} />
    </DashboardLayout>
  );
}
```

### Task 5.2 — ReelsHeroMetrics (4 Metric Cards)

**File:** Create `src/components/reels-studio/ReelsHeroMetrics.jsx`

4 `AnimatedCard` components in a row, each with `MetricPill`:

| Card | Metric | Color | Icon |
|------|--------|-------|------|
| Avg Hook Strength | `avg(hook_strength_pct)` | Violet | `Zap` |
| Avg Watch Time | `avg(avg_watch_time)` + "sec" | Cyan | `Clock` |
| Avg Skip Rate | `avg(skip_rate)` + "%" | Pink | `SkipForward` |
| Avg Replay Rate | `avg(estimated_replay_rate)` | Emerald | `Repeat` |

Computed client-side from `useReelsRetention()` data.

### Task 5.3 — HookStrengthTrend (Area Chart)

**File:** Create `src/components/reels-studio/HookStrengthTrend.jsx`

- Recharts `AreaChart` with gradient fill under the line
- X-axis: weeks. Y-axis: hook strength %
- Secondary line (dashed): avg watch time on right Y-axis
- Uses `useReelsTrend()` hook
- Gradient: violet-500 at top → transparent at bottom

```jsx
<defs>
  <linearGradient id="hookGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
  </linearGradient>
</defs>
<Area dataKey="avg_hook_strength_pct" stroke="#8b5cf6" fill="url(#hookGradient)"
  strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }}
/>
```

### Task 5.4 — ReelsRetentionTable (Sortable)

**File:** Create `src/components/reels-studio/ReelsRetentionTable.jsx`

Interactive table with:
- **Thumbnail column:** 48x48 rounded preview (from media_url/thumbnail_url)
- **Caption column:** First 60 chars, truncated
- **Hook %:** Color-coded pill (green ≥80, amber ≥60, red <60)
- **Watch Time:** In seconds with bar sparkline
- **Skip Rate:** With inline mini bar
- **Replay Rate:** percentage
- **Sort:** Click column headers to sort, animated reorder with `layout` prop
- **Click row:** Opens `PostInsightsDrawer`

Color-coded hook strength pill:
```jsx
const hookColor = (pct) =>
  pct >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
  pct >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" :
              "bg-rose-50 text-rose-700 border-rose-200";
```

---

## Checklist — Plan 2

| # | Task | File | Status |
|---|------|------|--------|
| 4.1 | ContentLabPage shell | `pages/ContentLabPage.jsx` | ⬜ |
| 4.2 | FormatBreakdownChart | `components/content-lab/FormatBreakdownChart.jsx` | ⬜ |
| 4.3 | AlgorithmScorePanel | `components/content-lab/AlgorithmScorePanel.jsx` | ⬜ |
| 4.4 | BestTimeHeatmap | `components/content-lab/BestTimeHeatmap.jsx` | ⬜ |
| 5.1 | ReelsStudioPage shell | `pages/ReelsStudioPage.jsx` | ⬜ |
| 5.2 | ReelsHeroMetrics | `components/reels-studio/ReelsHeroMetrics.jsx` | ⬜ |
| 5.3 | HookStrengthTrend | `components/reels-studio/HookStrengthTrend.jsx` | ⬜ |
| 5.4 | ReelsRetentionTable | `components/reels-studio/ReelsRetentionTable.jsx` | ⬜ |

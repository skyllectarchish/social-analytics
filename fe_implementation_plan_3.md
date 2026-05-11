# Frontend Implementation Plan — Part 3
## Audience DNA Page + Master FE Checklist

> All BE drill-down APIs have been moved to [tier1_implementation_plan_2.md](file:///c:/laragon/www/social-analytics/tier1_implementation_plan_2.md) Phase 7.

---

## Audience DNA Page (`/dashboard/audience`)

> **Creator question:** "Who are my real fans vs ghost followers?"

### Layout

```
┌─────────────────────────────────────────────────┐
│  PageHeader: "Audience DNA" 👥                  │
├───────────┬──────────┬──────────┬──────────────┤
│ QUALITY   │ HIGH     │ DORMANT  │ TOTAL        │
│ SCORE %   │ COHORTS  │ COHORTS  │ TRACKED      │
│ MetricPill cards (4 across, from summary API)   │
├─────────────────────────┬───────────────────────┤
│  QUALITY RADAR          │  COHORT TABLE         │
│  (Radar chart showing   │  (Sortable table with │
│   engagement rate per   │   tier badges: HIGH,  │
│   cohort dimension)     │   MED, LOW, DORMANT)  │
│  Toggle: age/gender/    │                       │
│  city/country           │                       │
├─────────────────────────┴───────────────────────┤
│  SPIKE DETECTION TIMELINE                       │
│  (Scatter plot: follower changes over time,     │
│   suspicious spikes highlighted in red)         │
└─────────────────────────────────────────────────┘
```

### Task 6.1 — AudienceDNAPage Shell

**File:** Create `src/pages/AudienceDNAPage.jsx`

```jsx
import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import QualityHeroMetrics from "../components/audience-dna/QualityHeroMetrics";
import QualityRadar from "../components/audience-dna/QualityRadar";
import CohortQualityTable from "../components/audience-dna/CohortQualityTable";
import SpikeTimeline from "../components/audience-dna/SpikeTimeline";
import SyncButton from "../components/dashboard/SyncButton";

export default function AudienceDNAPage() {
  const [breakdown, setBreakdown] = useState("age");
  const [spikeDays, setSpikeDays] = useState(90);

  const breakdownOptions = [
    { value: "age", label: "Age" },
    { value: "gender", label: "Gender" },
    { value: "city", label: "City" },
    { value: "country", label: "Country" },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="Audience DNA"
        emoji="👥"
        subtitle="Understand which follower segments are truly engaged vs dormant."
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        {/* Breakdown toggle pills */}
        <div className="flex gap-2">
          {breakdownOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBreakdown(opt.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                breakdown === opt.value
                  ? "bg-violet-100 text-violet-700 border border-violet-200"
                  : "bg-white text-slate-500 border border-slate-100 hover:border-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <QualityHeroMetrics breakdown={breakdown} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <QualityRadar breakdown={breakdown} />
          </div>
          <div className="lg:col-span-7">
            <CohortQualityTable breakdown={breakdown} />
          </div>
        </div>

        <SpikeTimeline days={spikeDays} onDaysChange={setSpikeDays} />
      </div>
    </DashboardLayout>
  );
}
```

### Task 6.2 — QualityHeroMetrics

4 metric cards from `useFollowerQualitySummary()`:

| Card | Metric | Color |
|------|--------|-------|
| Quality Score | `overall_quality_pct` + "%" | Violet (gauge-style) |
| High Quality | `high_quality_cohorts` cohorts | Emerald |
| Dormant | `dormant_cohorts` cohorts | Rose |
| Tracked | `total_followers_tracked` | Slate |

### Task 6.3 — QualityRadar (Recharts RadarChart)

**File:** Create `src/components/audience-dna/QualityRadar.jsx`

- Recharts `RadarChart` with `PolarGrid` + `PolarAngleAxis`
- Each axis = a cohort dimension value (e.g., "18-24", "25-34", etc.)
- Two overlaid polygons:
  - **Violet filled:** Follower count (normalized)
  - **Pink stroke:** Engaged count (normalized)
- Gap between them = dormant segment
- Animated on mount with framer-motion opacity

### Task 6.4 — CohortQualityTable

**File:** Create `src/components/audience-dna/CohortQualityTable.jsx`

Table columns:
- **Cohort:** dimension_value (e.g., "25-34", "Mumbai")
- **Followers:** count with bar sparkline
- **Engaged:** count
- **Rate:** engagement_rate_pct with color-coded progress bar
- **Tier:** Badge pill with color:
  - `HIGH` → emerald bg
  - `MEDIUM` → amber bg
  - `LOW` → slate bg
  - `DORMANT` → rose bg

Rows sorted by engagement_rate_pct descending. Animated reorder on breakdown change using `layout` prop.

### Task 6.5 — SpikeTimeline (Scatter Plot)

**File:** Create `src/components/audience-dna/SpikeTimeline.jsx`

- Recharts `ScatterChart` with X=date, Y=follows_change
- Dot size = magnitude of change
- Color: normal=violet, suspicious=rose with pulsing animation
- Hover tooltip shows: date, follows change, interactions, ratio
- Click suspicious dot → shows advisory message

---

## Task 6.6 — Add Drill-Down Hooks

**Append to `hooks/useTier1Insights.js`:**

```jsx
// Drill-down hooks (require BE Phase 7 endpoints)
export function useFormatBreakdownPosts(format, days = 90, limit = 20) {
  return useFetch(
    format ? `/instagram/insights/format-breakdown/posts?format=${format}&days=${days}&limit=${limit}` : null,
    [format, days, limit]
  );
}

export function useBestTimePosts(day, hour, days = 90) {
  return useFetch(
    day !== null && hour !== null
      ? `/instagram/insights/best-time/posts?day=${day}&hour=${hour}&days=${days}`
      : null,
    [day, hour, days]
  );
}
```

---

## FE Master Checklist

### FE Plan 1: Foundation

| Task | Component | Status |
|------|-----------|--------|
| 1.1 | DashboardSidebar | ⬜ |
| 1.2 | DashboardLayout update | ⬜ |
| 1.3 | Routes for new pages | ⬜ |
| 2.1 | AnimatedCard | ⬜ |
| 2.2 | MetricPill | ⬜ |
| 2.3 | DrillDownChart | ⬜ |
| 2.4 | PageHeader | ⬜ |
| 2.5 | Skeleton loaders | ⬜ |
| 3.1 | Tier 1 API hooks | ⬜ |

### FE Plan 2: Content Lab + Reels Studio

| Task | Component | Status |
|------|-----------|--------|
| 4.1 | ContentLabPage shell | ⬜ |
| 4.2 | FormatBreakdownChart (drill-down) | ⬜ |
| 4.3 | AlgorithmScorePanel | ⬜ |
| 4.4 | BestTimeHeatmap | ⬜ |
| 5.1 | ReelsStudioPage shell | ⬜ |
| 5.2 | ReelsHeroMetrics | ⬜ |
| 5.3 | HookStrengthTrend | ⬜ |
| 5.4 | ReelsRetentionTable | ⬜ |

### FE Plan 3: Audience DNA

| Task | Component | Status |
|------|-----------|--------|
| 6.1 | AudienceDNAPage shell | ⬜ |
| 6.2 | QualityHeroMetrics | ⬜ |
| 6.3 | QualityRadar | ⬜ |
| 6.4 | CohortQualityTable | ⬜ |
| 6.5 | SpikeTimeline | ⬜ |
| 6.6 | Drill-down hooks | ⬜ |

### NPM Dependencies
**No new packages needed.** Everything uses:
- `recharts` (already installed) — all charts
- `framer-motion` (already installed) — all animations
- `lucide-react` (already installed) — all icons
- `react-router-dom` (already installed) — routing

---

## Implementation Order

```
FE Plan 1 (foundation + sidebar + hooks)
    ↓
FE Plan 2 (Content Lab + Reels Studio)
    ↓
FE Plan 3 (Audience DNA)
```

**Total FE estimated effort: ~14 days**

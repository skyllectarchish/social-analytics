# Analytics Dashboard Frontend — Implementation Plan (1 of 2)

## Goal

Build the full `/dashboard` page in the **light pastel theme** matching the landing page UI/UX. This plan covers the **infrastructure changes** (theme switch, layout, sidebar, charting library) and the **core dashboard sections** (hero cards, time-series charts, follower growth, and top posts).

Plan 2 will cover demographics, per-post detail modal, stories, and the media grid with insights.

---

## Design System Decisions

> [!IMPORTANT]
> **Light theme everywhere.** The current `Layout.jsx` and `Navbar.jsx` use a dark `oklch(0.12...)` palette. The user wants the **entire project** switched to the light theme that matches `LandingPage.jsx`. This means the dashboard, insta-dashboard, login, register, connect, and callback pages all need the light pastel treatment.

### Visual Language (Matching Landing Page)
- **Background:** `#fafafb` (canvas white)
- **Cards:** `glass` / `glass-strong` classes (frosted translucent white)
- **Typography:** `font-display` for headings, `font-tight` for body, `text-gradient` for accents
- **Colors:** Violet/pink/peach/sky/mint pastel palette from `index.css`
- **Borders:** `rgba(15, 23, 42, 0.05)` subtle
- **Shadows:** `--shadow-soft`, `--shadow-pastel`, `--shadow-lift`
- **Text:** `#0a0e27` (navy) for headings, `text-slate-600` for body, `text-slate-500` for muted
- **Animations:** `framer-motion` for enter animations, CSS `drawLine`/`countUp` for charts

### Charting
- Use **hand-crafted SVG charts** (no chart library) — matches the existing `AnalyticsPreview.jsx` pattern from the landing page, which already renders SVG line charts, bar charts, and demographic progress bars.
- This keeps the bundle lean and the visual style 100% consistent.

---

## Proposed Changes

### Phase 1: Global Theme Switch (Dark → Light)

#### [MODIFY] [Layout.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/Layout.jsx)

Switch background from dark to light, add the `lumen-landing` class wrapper for the light pastel theme:

```diff
-    <div className="min-h-screen" style={{ background: "oklch(0.12 0.02 275)" }}>
+    <div className="lumen-landing min-h-screen" style={{ background: "#fafafb" }}>
```

#### [MODIFY] [Navbar.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/Navbar.jsx)

Convert from dark glass nav to light glass nav using the `glass-strong` class:

```diff
-    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
-      style={{ background: "oklch(0.15 0.02 275 / 0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid oklch(0.30 0.04 275)" }}>
+    <nav className="glass-strong sticky top-0 z-50 flex items-center justify-between px-6 py-4"
+      style={{ borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
```

Update all text colors:
- Logo text: `text-[#0a0e27]`
- Username: `text-slate-500`
- Button: light pastel styling

Add navigation links to the navbar: **Dashboard** | **Instagram** | **Stories**

#### [MODIFY] [LoginPage.jsx](file:///c:/laragon/www/social-analytics/frontend/src/pages/LoginPage.jsx)

Switch from dark to light:
- Background: `#fafafb`
- Form card: `glass-strong` class
- Input fields: white bg with subtle border
- Text: navy/slate palette

#### [MODIFY] [RegisterPage.jsx](file:///c:/laragon/www/social-analytics/frontend/src/pages/RegisterPage.jsx)

Same light theme conversion as LoginPage.

#### [MODIFY] [ConnectInstagramPage.jsx](file:///c:/laragon/www/social-analytics/frontend/src/pages/ConnectInstagramPage.jsx)

Same light theme conversion.

#### [MODIFY] [CallbackPage.jsx](file:///c:/laragon/www/social-analytics/frontend/src/pages/CallbackPage.jsx)

Same light theme conversion.

#### [MODIFY] [ProfileCard.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/ProfileCard.jsx)

Convert from dark card to `glass` card with navy text.

#### [MODIFY] [StatsOverview.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/StatsOverview.jsx)

Convert stat cards from dark surfaces to pastel-tinted `glass` cards (lavender, pink, mint).

#### [MODIFY] [MediaCard.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/MediaCard.jsx)

Convert from dark to light glass card.

#### [MODIFY] [MediaGrid.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/MediaGrid.jsx)

Update pagination button colors to match light theme.

#### [MODIFY] [index.css](file:///c:/laragon/www/social-analytics/frontend/src/index.css)

Update `body` default styles to light:
```diff
 body {
-  background-color: oklch(0.12 0.02 275);
-  color: oklch(0.95 0.01 275);
+  background-color: #fafafb;
+  color: #0a0e27;
 }
```

Update scrollbar to light:
```diff
-::-webkit-scrollbar-track { background: #05060d; }
+::-webkit-scrollbar-track { background: #f3f4f7; }
```

Add new CSS utility classes for dashboard cards:
```css
/* Dashboard metric cards */
.metric-card {
  @apply glass rounded-2xl p-5 transition-all;
  &:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }
}
```

---

### Phase 2: Dashboard Page — Core Sections

#### [NEW] [src/hooks/useInsights.js](file:///c:/laragon/www/social-analytics/frontend/src/hooks/useInsights.js)

Custom React hook that centralizes all analytics API calls. This keeps components clean and data-fetching reusable.

```javascript
import { useState, useEffect, useCallback } from "react";
import api from "../api/client";

export function useDashboard(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/instagram/insights/dashboard?days=${days}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Failed"))
      .finally(() => setLoading(false));
  }, [days]);

  return { data, loading, error };
}

export function useOverview(days = 30) { /* same pattern for /insights/overview */ }
export function useDemographics(metric, breakdown) { /* /insights/demographics */ }
export function useMediaInsights(mediaId) { /* /insights/media/{id} */ }
export function useStories() { /* /stories */ }

export function useSyncInsights() {
  const [syncing, setSyncing] = useState(false);
  const trigger = useCallback(async () => {
    setSyncing(true);
    try { await api.post("/instagram/insights/sync"); }
    finally { setSyncing(false); }
  }, []);
  return { syncing, trigger };
}
```

#### [MODIFY] [DashboardPage.jsx](file:///c:/laragon/www/social-analytics/frontend/src/pages/DashboardPage.jsx)

Complete rewrite. This becomes the main analytics dashboard. Structure:

```
DashboardPage
├── GradientMesh (subtle bg from landing)
├── Header bar: title + period selector (7d/30d/90d) + Sync button
├── HeroCards row (4 metric cards)
├── EngagementChart (SVG line chart)
├── FollowerGrowthChart (SVG bar chart)
├── TopPostsTable (ranked list)
└── (Demographics & Stories in Plan 2)
```

#### [NEW] [src/components/dashboard/HeroCards.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/HeroCards.jsx)

4 metric summary cards in a grid, powered by `GET /insights/dashboard`.

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Total Views │  Total Reach │  Interactions│  Net Growth  │
│   150,000    │   125,000    │    4,500     │    +450      │
│   📈 +18%   │   📈 +12%   │   📈 +24%   │   📈 +8%    │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Design:
- Each card uses the `glass` class with a pastel top-accent line (e.g., `card-lavender`, `card-pink`)
- Large number: `font-display text-3xl font-semibold text-[#0a0e27]`
- Use `AnimatedCounter` from `landing/ui/AnimatedCounter.jsx` for count-up effect
- Muted label: `text-[11px] uppercase tracking-[0.18em] text-slate-500`
- Growth badge: emerald pill for positive, rose pill for negative
- `framer-motion` stagger animation on mount

#### [NEW] [src/components/dashboard/PeriodSelector.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/PeriodSelector.jsx)

Pill-style toggle for `7d | 30d | 90d`. Uses `chip-soft` style from landing. Updates `days` state in DashboardPage, which re-triggers all API calls.

#### [NEW] [src/components/dashboard/EngagementChart.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/EngagementChart.jsx)

SVG area chart showing **Views** and **Reach** over time (two overlapping lines), powered by `GET /insights/overview`.

Design (copy the exact pattern from `AnalyticsPreview.jsx` lines 119-166):
- Gradient fill under the line (`area-grad`)
- Multi-color line stroke (`line-grad`: cyan → violet → pink)
- Dashed horizontal grid lines
- `drawLine` animation on scroll into view
- Pulsing dot at the latest data point
- X-axis date labels: `MMM DD` format
- Y-axis value labels
- Hover tooltip showing exact value + date (optional, stretch)

Data mapping:
```javascript
// From useOverview():
// overview.views.data = [{ end_time: "2026-05-01T00:00:00", value: 5000 }, ...]
// Map to SVG path coordinates
```

#### [NEW] [src/components/dashboard/FollowerGrowthChart.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/FollowerGrowthChart.jsx)

SVG bar chart showing daily `follows_and_unfollows` values, powered by `GET /insights/overview`.

Design:
- Vertical bars — emerald for positive days, rose for negative days
- `bar-rise` CSS animation (already defined in `index.css`)
- Date labels on x-axis
- Value labels on top of each bar
- `glass-subtle` card wrapper

#### [NEW] [src/components/dashboard/TopPostsTable.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/TopPostsTable.jsx)

Ranked list of top-performing posts from `GET /insights/dashboard` → `top_posts[]`.

Design:
- Each row is a `glass` card with a rank number, media type badge, truncated caption, views, and interactions
- Media type badges: pill-shaped — `VIDEO` = fuchsia, `IMAGE` = sky, `CAROUSEL_ALBUM` = peach
- Clicking a row opens the post permalink in a new tab
- `framer-motion` stagger animation (like `TOP_REELS` in `AnalyticsPreview.jsx` lines 233-255)

#### [NEW] [src/components/dashboard/SyncButton.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/SyncButton.jsx)

Button that calls `POST /insights/sync`. Shows a spinning refresh icon while syncing.

Design:
- Uses `btn-magnetic` style from landing
- Spinner animation during sync
- Success toast/indicator when sync completes

---

## File Summary

| Action | File | Purpose |
|---|---|---|
| MODIFY | `index.css` | Switch body to light theme, add dashboard CSS utilities |
| MODIFY | `Layout.jsx` | Light background wrapper |
| MODIFY | `Navbar.jsx` | Light glass nav + dashboard navigation links |
| MODIFY | `LoginPage.jsx` | Light theme conversion |
| MODIFY | `RegisterPage.jsx` | Light theme conversion |
| MODIFY | `ConnectInstagramPage.jsx` | Light theme conversion |
| MODIFY | `CallbackPage.jsx` | Light theme conversion |
| MODIFY | `ProfileCard.jsx` | Light glass card |
| MODIFY | `StatsOverview.jsx` | Pastel stat cards |
| MODIFY | `MediaCard.jsx` | Light glass card |
| MODIFY | `MediaGrid.jsx` | Light pagination |
| MODIFY | `DashboardPage.jsx` | Full rewrite — analytics dashboard |
| NEW | `hooks/useInsights.js` | Custom hooks for all analytics API calls |
| NEW | `components/dashboard/HeroCards.jsx` | 4 metric summary cards |
| NEW | `components/dashboard/PeriodSelector.jsx` | 7d/30d/90d toggle |
| NEW | `components/dashboard/EngagementChart.jsx` | SVG Views/Reach line chart |
| NEW | `components/dashboard/FollowerGrowthChart.jsx` | SVG follower bar chart |
| NEW | `components/dashboard/TopPostsTable.jsx` | Ranked top posts list |
| NEW | `components/dashboard/SyncButton.jsx` | Sync trigger button |

---

## API Endpoints Used in Plan 1

| Endpoint | Component(s) |
|---|---|
| `GET /instagram/insights/dashboard` | HeroCards, TopPostsTable |
| `GET /instagram/insights/overview` | EngagementChart, FollowerGrowthChart |
| `POST /instagram/insights/sync` | SyncButton |
| `GET /instagram/profile` | Navbar (show username/avatar) |

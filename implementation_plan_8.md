# Analytics Dashboard Frontend — Implementation Plan (2 of 2)

## Goal

Build the remaining dashboard sections: **Demographics**, **Per-Post Insights Modal**, **Active Stories**, and **Media Grid with Insights Overlay**. This completes the full analytics dashboard.

---

## Proposed Changes

### Demographics Panel

#### [NEW] [src/components/dashboard/DemographicsPanel.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/DemographicsPanel.jsx)

A tabbed panel with 4 breakdowns, powered by `GET /insights/demographics`.

**Tab layout:**
```
┌─────────────────────────────────────────────────────────┐
│  [Age]  [Gender]  [City]  [Country]                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  18-24  ████████████████████████  38%                   │
│  25-34  ██████████████████████████████  46%             │
│  35-44  ████████  12%                                   │
│  45+    ███  4%                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Design:**
- `glass-strong` wrapper card
- Tabs: `chip-soft` pills, active tab gets `bg-gradient-to-r from-violet-500 to-pink-500 text-white`
- Horizontal progress bars with pastel gradient fills (same pattern as `AnalyticsPreview.jsx` DEMOGRAPHIC_BARS)
- `framer-motion` animated width on each bar
- Label on left, percentage on right, value tooltip on hover
- Section header: `font-display text-lg text-[#0a0e27]` + `text-[11px] uppercase tracking-[0.18em] text-slate-500` eyebrow

**Data flow:**
- `useDemographics(metric, breakdown)` hook
- Default: `metric="follower_demographics"`, `breakdown="age"`
- Second toggle for metric: "Followers" | "Engaged Audience"

#### [NEW] [src/components/dashboard/GenderDonut.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/GenderDonut.jsx)

When the "Gender" tab is selected, render a SVG donut chart instead of bars. This provides a visually distinct representation for the binary/ternary gender data.

**Design:**
- SVG circle with `stroke-dasharray` segments
- Color segments: violet (Male), pink (Female), slate (Other)
- Center text: total count
- Legend below: colored dots + labels + percentages

---

### Per-Post Insights Detail

#### [NEW] [src/components/dashboard/PostInsightsDrawer.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/PostInsightsDrawer.jsx)

A slide-up drawer/modal that shows detailed insights for a single post. Triggered when clicking any post in TopPostsTable or the media grid.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  ✕                                                   │
│  [Thumbnail]  Caption text...                        │
│  VIDEO · May 7, 2026 · instagram.com/reel/xyz        │
│                                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │Likes │ │Comms │ │Shares│ │Saved │ │Reach │       │
│  │4,500 │ │ 120  │ │ 350  │ │ 850  │ │38,000│       │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │
│                                                      │
│  Views: 45,000                                       │
│  Total Interactions: 5,820                           │
│  Avg Watch Time: 4.5s  (Reels only)                  │
│  Total View Time: 56.25 hrs (Reels only)             │
└──────────────────────────────────────────────────────┘
```

**Design:**
- `framer-motion` `AnimatePresence` slide-up from bottom
- Backdrop blur overlay
- `glass-strong` card
- Metric mini-cards: `glass` pills with lucide icons (Heart, MessageCircle, Share2, Bookmark, Eye)
- Uses `AnimatedCounter` for values
- Reel-specific metrics (watch time) only shown when `media_type === "VIDEO"`

**Data flow:**
- `useMediaInsights(mediaId)` hook — calls `GET /insights/media/{mediaId}`
- Triggered when user clicks a row in TopPostsTable
- Pass `mediaId` via React state in DashboardPage

---

### Active Stories Panel

#### [NEW] [src/components/dashboard/StoriesPanel.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/StoriesPanel.jsx)

Horizontal scrollable strip showing active stories with live insights, powered by `GET /stories`.

**Layout:**
```
Active Stories (2 live)
┌────────┐ ┌────────┐
│  [img] │ │  [img] │
│  🟢    │ │  🟢    │
│ 1.2K   │ │  800   │
│ views  │ │ views  │
└────────┘ └────────┘
```

**Design:**
- Horizontal scroll container with snap
- Each story: rounded card with thumbnail, gradient ring (Instagram-style), view count overlay
- If no active stories: subtle empty state "No stories live right now"
- Click to expand: show full insights in a popover/tooltip

**Data flow:**
- `useStories()` hook
- Stories endpoint returns live data, no sync needed

---

### Enhanced Media Grid with Insights Overlay

#### [MODIFY] [src/components/MediaCard.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/MediaCard.jsx)

Add an insights overlay on hover that shows reach + views + interactions for each post.

**Design:**
- On hover: semi-transparent gradient overlay with key metrics
- Eye icon + view count, Heart icon + like count
- Click: opens `PostInsightsDrawer` with full metrics

---

### Empty States

#### [NEW] [src/components/dashboard/EmptyState.jsx](file:///c:/laragon/www/social-analytics/frontend/src/components/dashboard/EmptyState.jsx)

Reusable empty state component for when data hasn't been synced yet.

**Design:**
- `glass-subtle` card
- Centered illustration (lucide icon composition)
- Title + description
- CTA button (e.g., "Sync Now" → triggers sync)

**Variants:**
- "No insights data yet" → shows when `/insights/dashboard` returns zeros
- "No stories live" → shows when `/stories` returns empty array
- "Connect Instagram first" → shows when no profile is connected

---

### Dashboard Page Assembly

#### [MODIFY] [DashboardPage.jsx](file:///c:/laragon/www/social-analytics/frontend/src/pages/DashboardPage.jsx)

Add the Plan 2 components beneath the Plan 1 sections:

```jsx
<DashboardPage>
  {/* Plan 1 sections */}
  <Header + PeriodSelector + SyncButton />
  <HeroCards />
  <EngagementChart />

  {/* Plan 2 sections */}
  <div className="grid lg:grid-cols-[1.4fr,1fr] gap-6">
    <FollowerGrowthChart />
    <DemographicsPanel />
  </div>

  <StoriesPanel />
  <TopPostsTable onClick={setSelectedPostId} />

  {/* Drawer overlay */}
  <PostInsightsDrawer
    mediaId={selectedPostId}
    onClose={() => setSelectedPostId(null)}
  />
</DashboardPage>
```

---

### Responsive Design

- **Desktop (lg+):** 2-column layout for chart + demographics, full-width for engagement chart
- **Tablet (md):** Stack vertically but keep 2-col for hero cards
- **Mobile (sm):** Single column, stories panel becomes swipeable
- **PeriodSelector:** Compact on mobile (icons instead of text)
- **TopPostsTable:** Horizontal scroll on mobile
- **PostInsightsDrawer:** Full-screen on mobile, half-screen on desktop

---

## File Summary

| Action | File | Purpose |
|---|---|---|
| NEW | `components/dashboard/DemographicsPanel.jsx` | Tabbed demographics with bar charts |
| NEW | `components/dashboard/GenderDonut.jsx` | SVG donut for gender breakdown |
| NEW | `components/dashboard/PostInsightsDrawer.jsx` | Per-post detail slide-up |
| NEW | `components/dashboard/StoriesPanel.jsx` | Active stories horizontal strip |
| NEW | `components/dashboard/EmptyState.jsx` | Beautiful empty states |
| MODIFY | `components/MediaCard.jsx` | Add insights hover overlay |
| MODIFY | `pages/DashboardPage.jsx` | Integrate Plan 2 components |

---

## API Endpoints Used in Plan 2

| Endpoint | Component(s) |
|---|---|
| `GET /instagram/insights/demographics` | DemographicsPanel, GenderDonut |
| `GET /instagram/insights/media/{id}` | PostInsightsDrawer |
| `GET /instagram/stories` | StoriesPanel |

---

## Full Dashboard Layout (Both Plans Combined)

```
┌───────────────────────────────────────────────────────────────┐
│  Navbar (glass-strong, light)                                 │
│  [Logo] Dashboard  Instagram  Stories            @user [out]  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Analytics Dashboard           [7d] [30d] [90d]   [⟳ Sync]  │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Views   │ │  Reach   │ │Interacts │ │ Growth   │         │
│  │ 150,000  │ │ 125,000  │ │  4,500   │ │  +450    │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Engagement Over Time (SVG area chart)                 │   │
│  │  ───── Views  ───── Reach                              │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────┐ ┌──────────────────────────┐   │
│  │  Follower Growth (bars)  │ │  Demographics            │   │
│  │  ▓▓▓ ▓▓ ▓▓▓▓ ▓▓ ▓▓▓   │ │  [Age][Gender][City]     │   │
│  └──────────────────────────┘ └──────────────────────────┘   │
│                                                               │
│  Active Stories (horizontal strip)                            │
│  ┌────┐ ┌────┐ ┌────┐                                       │
│  │ 🟢 │ │ 🟢 │ │ 🟢 │                                       │
│  └────┘ └────┘ └────┘                                        │
│                                                               │
│  Top Performing Posts                                         │
│  1. Sunset Reel · 45K views · 1.2K interactions              │
│  2. Photo dump · 22K views · 850 interactions                │
│  3. ...                                                       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

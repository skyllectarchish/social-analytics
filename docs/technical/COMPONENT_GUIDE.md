# COMPONENT_GUIDE.md

> Frontend component & page reference. Two dashboard shells (`DashboardLayout` for Instagram, `YoutubeDashboardLayout` for YouTube), 26 pages, and ~45 components. State is local `useState`/`useEffect` per page; the only global state is `AuthContext` and `PeriodComparatorContext`.

---

## 1. Application tree

```
App (ErrorBoundary → BrowserRouter → AuthProvider → PeriodComparatorProvider)
├── HomeRoute → Landing (guests)              components/Landing.tsx
├── /login, /register → Guest → AuthShell
├── /connect, /auth/instagram/callback → Protected
├── Instagram pages (Protected, inside DashboardLayout)
│   ├── /dashboard            DashboardPage
│   ├── /dashboard/posts      PostsPage
│   ├── /dashboard/import     ImportPage
│   ├── /dashboard/content    ContentLabPage
│   ├── /dashboard/reels      ReelsStudioPage
│   ├── /dashboard/audience   AudienceDNAPage
│   ├── /dashboard/competitors CompetitorsPage
│   ├── /dashboard/copilot    CopilotPage
│   ├── /dashboard/media-kit  MediaKitPage
│   └── /dashboard/automation DMAutomationPage  (legacy /dashboard/funnels → redirect)
├── YouTube pages (Protected, inside YoutubeDashboardLayout)
│   ├── /youtube              YoutubeDashboardPage
│   ├── /youtube/retention    YoutubeRetentionPage
│   ├── /youtube/competitors  YoutubeCompetitorsPage
│   ├── /youtube/predict      YoutubePredictivePage
│   ├── /youtube/archive      YoutubeArchivePage
│   ├── /youtube/funnel       YoutubeFunnelPage
│   └── /youtube/connect, /auth/youtube/callback
├── /privacy, /terms          static
└── * → NotFound
```

`InboxPage` exists and is fully built but is **not imported/routed** — dead code.

---

## 2. Layout shells

### DashboardLayout (`components/dashboard/DashboardLayout.tsx`)
App shell for IG pages: sidebar nav, sticky header (date-range, Sync chip, AI-quota chip, profile menu), aurora background, connect banner.
- **Props:** `children`, `active?` (default "Overview"), `days`, `onDaysChange`, `onSync`, `syncing`, `fill?`.
- **API:** `GET /ai/quota` (safeGet, :188), `GET /instagram/profile` (:194 — 404 → connect banner), `POST /instagram/disconnect` (:162).
- **NAV** (:33): Overview `/dashboard` · Posts `/dashboard/posts` · DM Automation `/dashboard/automation` · Content Lab `/dashboard/content` · Reels Studio `/dashboard/reels` · Audience DNA `/dashboard/audience` · Competitors `/dashboard/competitors` · AI Copilot `/dashboard/copilot`.
- **State:** `mobileOpen, profileOpen, quota, connected, profile`; `useAuth()`.
- Platform switcher links IG↔YouTube; the "Sync" chip calls the parent's `onSync` (the page owns the sync endpoint).

### YoutubeDashboardLayout (`components/youtube/YoutubeDashboardLayout.tsx`)
YouTube counterpart; **no date-range selector**.
- **API:** `GET /ai/quota` (:188), `GET /youtube/channel` (:194), `POST /youtube/disconnect` (:162).
- **YT_NAV** (:30): Overview `/youtube` · Retention Studio `/youtube/retention` · Competitors `/youtube/competitors` · Predictive Studio `/youtube/predict` · Archive Miner `/youtube/archive` · Cross-Platform `/youtube/funnel`.

---

## 3. Pages (purpose · APIs · child components)

| Page | Route | APIs (verbatim paths) | Notable children |
|---|---|---|---|
| LoginPage | /login | `POST /auth/login` (via useAuth) | AuthShell |
| RegisterPage | /register | `POST /auth/register` | AuthShell |
| ConnectInstagramPage | /connect | `GET /instagram/connect` | inline |
| CallbackPage | /auth/instagram/callback | `GET /instagram/callback` | inline (StrictMode ref-guard) |
| **DashboardPage** | /dashboard | `GET /instagram/profile`, `/insights/dashboard`, `/insights/overview`, `/stories`, `/insights/alerts`, `/insights/demographics`×2; `POST /refresh`, `/insights/sync` | DashboardLayout, PostInsightsDrawer, AlertsCard, ComparisonPill, Sparkline, GlassTooltip |
| PostsPage | /dashboard/posts | `GET /instagram/media`; `POST /refresh` | PostInsightsDrawer, MediaGridSkeleton |
| ImportPage | /dashboard/import | `GET /instagram/import/summary`; `POST /import/archive` | GlassTooltip |
| **ContentLabPage** | /dashboard/content | `GET /insights/best-time`(+/posts), `/format-breakdown`(+/posts), `/algorithm-metrics`, `/hashtags`(+/trend,/combos) | DrillDown, BrandedHashtags, PostInsightsDrawer |
| ReelsStudioPage | /dashboard/reels | `GET /insights/reels-retention`(+/trend) | AnimatedCard, AnimatedNumber, GlassTooltip |
| **AudienceDNAPage** | /dashboard/audience | `GET /insights/sentiment`(+/topics,/questions,/diagnose), `/follower-quality`(+/summary,/spikes), `/growth-drivers`, `/growth-correlation`; `POST /sentiment/seed-demo` | StatSkeleton, GlassTooltip |
| CompetitorsPage | /dashboard/competitors | `GET /competitors`(+/timeline,/content-mix,/lookup); `POST`/`DELETE /competitors` | ListSkeleton, Recharts |
| **CopilotPage** | /dashboard/copilot | `GET /ai/quota` (rest delegated to children) | WeeklyDigestCard, ContentIdeasPanel, ViralHooksPanel, TrendingAudioPanel, AudienceDemandCard, FormatFatigueCard, RepurposeCard, CaptionStudioDialog, PostDiagnosticDrawer, AIDisclosure |
| MediaKitPage | /dashboard/media-kit | `GET /instagram/profile`, `/insights/dashboard`, `/insights/demographics`×3; `POST /refresh`,`/insights/sync` | CardEmpty, PageSkeleton |
| DMAutomationPage | /dashboard/automation | `GET /dm-funnels`(+/sends), `/profile`, `/media`; `POST`/`DELETE /dm-funnels` | CreateAutomationForm (internal) |
| InboxPage ⚠ | (none) | `GET /comments/inbox`,`/superfans`; `POST /ai/comment-reply`, `/comments/{id}/reply`, `/insights/sync`; `waitForSync` | ReplyComposer, SuperfansCard (internal) |
| YoutubeConnectPage | /youtube/connect | `GET /youtube/connect` | inline |
| YoutubeCallbackPage | /auth/youtube/callback | `GET /youtube/callback` | inline |
| YoutubeDashboardPage | /youtube | `GET /insights/overview`, `/videos`; `POST /insights/sync` | Sparkline, GlassTooltip |
| YoutubeRetentionPage | /youtube/retention | `GET /videos`, `/insights/retention/{id}`; `POST /insights/sync` | VideoCard, SmartRetentionChart |
| YoutubeCompetitorsPage | /youtube/competitors | `GET /competitors`,`/insights/outliers`,`/recent-videos`,`/insights/title-history/{id}`; `POST`/`DELETE`; `POST /competitors/sync` | CardEmpty |
| YoutubePredictivePage | /youtube/predict | `GET /videos`, `/insights/velocity/{id}`, `/insights/predictions/{id}`; `POST /insights/sync` | GlassTooltip, Recharts |
| YoutubeArchivePage | /youtube/archive | `GET /insights/archive`(5s poll); `POST /insights/archive/refresh`, `/insights/sync` | SuggestionCard (internal) |
| YoutubeFunnelPage | /youtube/funnel | `GET /insights/cross-platform` | CustomTooltip (internal) |
| Privacy/Terms | /privacy,/terms | none | static prose |

---

## 4. Dashboard components

| Component | Purpose | API |
|---|---|---|
| `AlertsCard` | render period alerts (drop/surge/overperform); overperform rows → `onOpenPost` | none |
| `BrandedHashtags` | track ≤3 brand tags + mentions | `GET/POST/DELETE /branded-hashtags[...]`, `/{tag}/mentions` |
| `PostInsightsDrawer` | per-post insight slide-over | `GET /insights/media/{id}` + `useAuthedImage` |
| `Skeletons` | shimmer primitives (`Skeleton`, `StatSkeleton`, `ChartSkeleton`, `ListSkeleton`, `MediaGridSkeleton`, `PageSkeleton`) | none |
| `States` | `CardEmpty` empty-state | none |

---

## 5. Copilot components

Shared infra: `AIDisclosure` (one-time modal, localStorage `ai_disclosure_acked_v1`), `AIFeedback` (`POST /ai/feedback`, optimistic), `AIMarkdown` (safe minimal markdown, no raw HTML).

| Component | AI endpoint | Trigger |
|---|---|---|
| `AudienceDemandCard` | `POST /ai/question-mining` | "Mine questions" |
| `CaptionStudioDialog` | `POST /ai/caption/suggest` | "Score draft" (branches on 429) |
| `ContentIdeasPanel` | `GET /ai/ideas` (+`refresh=true`) | mount + "New ideas" |
| `PostDiagnosticDrawer` | `POST /ai/diagnose-post` | open (branches on 422 "too recent") |
| `ReelScriptDialog` | `POST /ai/reel-script` | open |
| `RepurposeCard` | `POST /ai/repurpose` | "Repurpose" |
| `ViralHooksPanel` | `POST /ai/hooks` | "Generate hooks" |
| `WeeklyDigestCard` | `GET /ai/digest/weekly` + **SSE** `streamSSE(/ai/digest/stream)` | load + "Regenerate" |
| `FormatFatigueCard` | `GET /instagram/insights/format-fatigue` (deterministic, **no quota**) | mount |
| `TrendingAudioPanel` | `GET /instagram/trending-audio` (curated; mock fallback) | mount |

**Quota plumbing:** the 8 quota-spending cards share `exhausted: boolean` + `onQuotaSpent: () => void` props; the layouts surface remaining quota via `GET /ai/quota`. All AI cards embed `AIFeedback` and render via `AIMarkdown`.

---

## 6. YouTube, charts & ui components

- **`VideoCard`** (youtube) — presentational thumbnail card; `{video, active, onClick}`.
- **`SmartRetentionChart`** (youtube) — Recharts `ComposedChart`: retention `Area` + dashed benchmark `Line` + `ReferenceLine` per AI-detected cliff; props `{curve, annotations, annotationsPending, durationSeconds}`; no API (data passed in).
- **`DrillDown`** (charts) — generic click-to-drill card with a level stack + back button; render-prop children.
- **`GlassTooltip`** (charts) — frosted Recharts tooltip (`unit?`, `labelText?`).
- **`Sparkline`** (charts) — axis-less area chart (`data:{v}[]`, `color?`).
- **`ComparisonPill`** (ui) — delta pill (arrow + signed %, ✨ if significant); uses `lib/stats.pctDelta`; renders nothing when no delta.
- **`Logo`, `Motion`** (`AnimatedCard`/`AnimatedNumber`), **`Reveal`** (ui) — brand + animation primitives.

---

## 7. Landing composition (`Landing.tsx`, in order)

`Nav` → `Hero` → `LogoStrip` → `Features` → `ChartsStory` → `Community` → `TrendingAudio` → `HowItWorks` → `Pricing` → `Testimonials` → `FinalCTA` → `Footer`. All presentational; data from `data/mock.ts`. (`HeroMockup` is used inside `Hero`, not directly by `Landing`.)

---

## 8. Hooks & lib

- **`useAuth`** — `useContext(AuthContext)`; throws outside provider.
- **`useAuthedImage(igMediaId)`** — fetches `/instagram/media/{id}/image` as a blob, returns an object URL; revokes on unmount.
- **`useSync`** — ⚠ **cosmetic** 900ms `setTimeout` flag (not a real poller). Real sync waiting is `waitForSync()` in `client.ts` (polls `/insights/sync/status` at 1.5s).
- **`lib/stats`** — `pctDelta(current,prior)` (null if prior is 0/null), `avgOf`, `sumOf`.
- **`lib/labels.mediaLabel`** — IG media-type → "Reel"/"Post"/"Photo"/"Story".
- **`lib/telemetry.trackAI`** — batched `POST /telemetry` every 5s / 16 events / on `pagehide`; self-disables on 401/403/404.
- **`api/client`** — axios instance; `tokenStore` (localStorage `access_token`), `safeGet`, `waitForSync`, `errorMessage`, `normalizeDetail`.

---

## 9. State management summary

- **Global (Context):** `AuthContext` (`user`, `loading`; actions `login`/`register`/`logout`); `PeriodComparatorContext` (`compareMode`, `customRange`; derived `compareTo`/`calendarPreset`; consumed by Dashboard/Audience/ContentLab pages).
- **Out-of-React global:** auth token in `localStorage["access_token"]`; telemetry buffer in `lib/telemetry.ts`.
- **Local:** every page owns fetched data via `useState`; no client cache, no React Query.
- **Derived:** `compareTo`/`calendarPreset` (memoized in context); `pctDelta` computed inline.

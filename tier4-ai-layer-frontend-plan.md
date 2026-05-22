# Tier 4 — AI Layer · Frontend Implementation Plan

Scope: the four AI-layer features called out as Tier 4 in
`instagram-analytics-feature-research.md`.

| # | Feature | Primary surface |
| - | --- | --- |
| 15 | Weekly AI Insights Digest | Dedicated page card + dashboard hero strip |
| 16 | Content Idea Generator from Performance | Dedicated panel inside `ContentLabPage` |
| 17 | "Why did this post flop?" Diagnostic | Drawer launched from any post card |
| 18 | Caption A/B Suggestions | Modal/studio launched from compose-style entry points |

This document covers **frontend work only**. Backend assumptions are listed
inline so the contracts can be built in parallel — the FE plan stays valid
regardless of which LLM provider (Gemini/Claude/OpenAI) the backend uses
under the hood.

---

## 1. Architectural shape

### 1.1 New route

```
/dashboard/copilot   →   AICopilotPage.jsx   (ProtectedRoute)
```

Route is nested under `/dashboard/*` to match the existing pattern
(`/dashboard/content`, `/dashboard/reels`, `/dashboard/audience`,
`/dashboard/competitors`) — these are all sidebar-driven workspaces under
`DashboardLayout`. The Copilot page hosts the long-running surfaces
(Weekly Digest, Content Ideas, free-form Ask-the-Data). The two
task-bound features (Post Diagnostic, Caption Studio) live as
drawer/modal launched in context from existing pages, not as standalone
routes. That keeps them one click away from the posts they're
explaining.

### 1.2 File layout

```
frontend/src/
  pages/
    AICopilotPage.jsx                       # new — Tier 4 hub
  components/
    copilot/                                # new
      WeeklyDigestCard.jsx
      WeeklyDigestEmptyState.jsx
      DigestNarrative.jsx                   # markdown renderer + citations
      ContentIdeasPanel.jsx
      IdeaCard.jsx
      AskTheDataPanel.jsx                   # free-form Q&A (optional v2)
      PostDiagnosticDrawer.jsx              # used from MediaCard / TopPosts
      DiagnosticVerdictBlock.jsx
      DiagnosticFactorRow.jsx
      CaptionStudioDialog.jsx               # caption A/B + suggestions
      CaptionDiffView.jsx
      CaptionScoreMeter.jsx
      AIFeedbackButtons.jsx                 # thumbs up/down across features
      AIQuotaBadge.jsx                      # "12 of 100 AI calls this month"
      AIStreamSurface.jsx                   # shared streaming text container
  hooks/
    useAIDigest.js
    useContentIdeas.js
    usePostDiagnostic.js
    useCaptionStudio.js
    useAIQuota.js
    useAIFeedback.js
  api/
    aiStream.js                             # SSE / fetch-stream helper
```

`shared/` already has `PageHeader`, `AnimatedCard`, `Skeleton`, and
`PeriodComparatorBar`. Reuse them; do not duplicate.

### 1.3 Sidebar nav

Add a "Copilot" entry to `DashboardSidebar.jsx` `NAV_ITEMS` array,
positioned last (after "Competitors"). Use a `Sparkles` lucide icon
(already used on the landing page — verified to exist in this lucide
version). Mark with a small `Beta` chip until quota + cost guardrails
are in place.

The exact shape of the entry (matching the existing `NAV_ITEMS` literal
in `frontend/src/components/DashboardSidebar.jsx`):

```jsx
import { BarChart3, FlaskConical, Film, Users, LineChart, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard",             icon: BarChart3,   label: "Overview" },
  { to: "/dashboard/content",     icon: FlaskConical,label: "Content Lab" },
  { to: "/dashboard/reels",       icon: Film,        label: "Reels Studio" },
  { to: "/dashboard/audience",    icon: Users,       label: "Audience DNA" },
  { to: "/dashboard/competitors", icon: LineChart,   label: "Competitors" },
  { to: "/dashboard/copilot",     icon: Sparkles,    label: "Copilot", beta: true },
];
```

`DashboardSidebar` currently renders `<Icon>` + `<span>` only. Extend
its row template so when `beta === true` it renders a tiny pill after
the label:

```jsx
{beta && (
  <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider
                   px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-600">
    Beta
  </span>
)}
```

The `motion.div` `layoutId="sidebar-active"` highlight animation already
handles active-state transitions — the new entry inherits it for free.

### 1.4 Mount points for the two contextual surfaces

- **PostDiagnosticDrawer** — opened from:
  - `components/MediaCard.jsx` (overflow menu → "Diagnose this post")
  - `components/dashboard/TopPostsCard.jsx` (right-aligned icon button per row)
  - Format-breakdown drill-down post lists (`FormatBreakdownPosts`)
  - The existing `PostInsightsDrawer` (if present) gets a "Diagnose" tab
- **CaptionStudioDialog** — opened from:
  - A new "Caption Studio" button in the Copilot page header
  - `ReelsStudioPage.jsx` header (since Reels = highest-effort captions)
  - Optionally `ContentLabPage.jsx` header

---

## 2. Backend contract assumptions

These are the endpoint shapes the frontend will code against. Backend
implementation is out of scope here but must match these signatures.

All endpoints live under `/api/ai/` and use the existing JWT bearer auth
through `api/client.js`. All return JSON unless explicitly streaming.

### 2.1 Weekly Digest

```
GET  /api/ai/digest/weekly?week_of=2026-05-18   →  WeeklyDigestResponse
POST /api/ai/digest/regenerate                  →  WeeklyDigestResponse
```

```ts
WeeklyDigestResponse = {
  week_of: "2026-05-18",       // ISO date (Monday of the synthesized week)
  generated_at: "2026-05-20T08:00:00Z",
  status: "ready" | "stale" | "generating" | "not_enough_data",
  cached: boolean,             // true if served from a stored synthesis
  narrative_md: string,        // markdown body
  bullets: [
    {
      kind: "win" | "warning" | "trend" | "experiment",
      headline: string,
      detail_md: string,
      // optional citation back into the dashboard:
      link: { route: string, query: Record<string, string> } | null,
    }
  ],
  metrics_snapshot: {          // raw deltas so FE can render chips alongside
    save_rate_pct_delta: number | null,
    reach_pct_delta: number | null,
    follows_delta: number | null,
    posts_count: number,
  },
  followups: string[],         // suggested next actions, plain text
}
```

`POST /regenerate` bypasses the cache (cost-controlled — see quota
endpoint).

### 2.2 Content Ideas

```
GET  /api/ai/ideas?days=90&limit=5   →  ContentIdeasResponse
```

```ts
ContentIdeasResponse = {
  period_days: 90,
  generated_at: string,
  source_posts: [
    { ig_media_id, permalink, thumbnail_url, caption_preview, algorithm_score_pct }
  ],
  themes_detected: string[],        // top themes the LLM extracted
  ideas: [
    {
      id: string,                    // stable for feedback / "save"
      title: string,
      body_md: string,
      suggested_format: "REELS" | "CAROUSEL" | "IMAGE" | "STORY",
      rationale: string,             // 1-2 sentences referencing source posts
      adjacent: boolean,             // true if "underexplored adjacent theme"
    }
  ],
}
```

### 2.3 Post Diagnostic

```
POST /api/ai/diagnose-post   body: { ig_media_id: string }   →  DiagnosticResponse
```

```ts
DiagnosticResponse = {
  ig_media_id: string,
  baseline: {                       // user-account baseline metrics
    avg_reach: number,
    avg_engagement_rate_pct: number,
    avg_save_rate_pct: number,
  },
  observed: { ... same shape ... },
  underperformed: boolean,
  verdict_md: string,               // 1-paragraph headline diagnosis
  factors: [
    {
      key: "format" | "timing" | "hashtags" | "topic" | "duration" | "hook",
      severity: "high" | "medium" | "low" | "neutral",
      headline: string,
      detail_md: string,
      evidence: { metric: string, value: number, comparison: string },
    }
  ],
  recommendations_md: string,
}
```

### 2.4 Caption Studio

```
POST /api/ai/caption/suggest
  body: {
    draft: string,
    format: "REELS" | "CAROUSEL" | "IMAGE" | "STORY",
    topic_hint?: string,
  }
  → CaptionSuggestResponse
```

```ts
CaptionSuggestResponse = {
  draft: string,
  scores: {
    hook_strength: 0..100,
    cta_presence: 0..100,
    length_fit: 0..100,
    overall: 0..100,
  },
  variants: [
    {
      id: string,
      label: "Punchier hook" | "Stronger CTA" | "Shorter" | "Question hook" | ...,
      caption: string,
      rationale: string,
    }
  ],
  notes_md: string,                 // ungated commentary
}
```

### 2.5 Cross-cutting

```
GET  /api/ai/quota                  → { used: int, limit: int, resets_at: ISO }
POST /api/ai/feedback               body: { feature: string, ref_id: string,
                                            rating: "up"|"down", note?: string }
```

Streaming variants for digest + ideas + diagnostic should also be exposed
under `/api/ai/<feature>/stream` returning Server-Sent Events with
`event: token` / `event: done` / `event: error`. FE will prefer streaming
when available.

---

## 3. Page-by-page specs

### 3.1 `AICopilotPage.jsx`

**Layout** — uses `DashboardLayout` + `PageHeader` (title "Copilot",
subtitle "Synthesizes your week and suggests what to make next.", header
action: `AIQuotaBadge`).

```
┌─────────────────────────────────────────────────────────┐
│ PageHeader              AIQuotaBadge  · CaptionStudio   │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────── WeeklyDigestCard ────────────────────┐│
│ │ headline · regenerate button                          ││
│ │ narrative_md (markdown)                               ││
│ │ bullets grid (win / warning / trend / experiment)     ││
│ │ followups chip row                                    ││
│ │ AIFeedbackButtons                                     ││
│ └───────────────────────────────────────────────────────┘│
│ ┌──────────────── ContentIdeasPanel ───────────────────┐│
│ │ themes_detected chips  ·  days selector  ·  refresh   ││
│ │ ideas grid (3 col) — IdeaCard with format pill, copy  ││
│ │ "Show 3 adjacent themes" toggle                       ││
│ └───────────────────────────────────────────────────────┘│
│ ┌──────────────── AskTheDataPanel (v2) ────────────────┐│
│ │ free-form prompt, last 5 turns, streaming response    ││
│ └───────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**States** (top-level):

- `not_connected` → show the existing `InstagramNotConnectedBanner`.
- `insufficient_data` → digest status `"not_enough_data"`; render a
  guidance card explaining the minimum sample (e.g. "Need ≥7 days of
  posting history").
- `quota_exhausted` → render digest as cached-only, regenerate button
  disabled with tooltip.
- `loading` → skeleton blocks per section (reuse `Skeleton`).

### 3.2 `WeeklyDigestCard.jsx`

- Header: "Week of {Mon DD}" (formatted via `date-fns`); regenerate
  button (disabled while streaming, secondary if `cached=false`).
- Body: `DigestNarrative` renders `narrative_md` via `react-markdown`.
  - Mount custom anchor renderer so links from `bullets[].link` open the
    target route via React Router `useNavigate` instead of `<a href>`.
- Bullet grid: one `kind` per color token:
  - win → emerald
  - warning → amber
  - trend → sky
  - experiment → violet (matches the existing brand gradient)
- `AIFeedbackButtons` at footer; one thumbs/feedback target per digest.

**Edge cases**

- `status="generating"` → show `AIStreamSurface` with shimmering text
  while tokens arrive via SSE.
- `status="stale"` and `cached=true` → small "Last refreshed N hours ago"
  pill next to the regenerate button.

### 3.3 `ContentIdeasPanel.jsx`

- Controls row: `days` selector (30 / 90 / 180), refresh button, "Show
  adjacent only" toggle.
- Source posts: small horizontal thumbnail strip ("Based on these 5
  posts") clicking a thumbnail opens `PostDiagnosticDrawer` for that
  post — ties the two features together.
- `IdeaCard`:
  - Title, format pill, body markdown
  - Footer: copy-to-clipboard, "Save to drafts" (out of scope until a
    drafts table exists — stubbed), feedback buttons.
  - `adjacent=true` cards get a dashed border to make them visually
    distinct from the "in your existing themes" cards.

### 3.4 `PostDiagnosticDrawer.jsx`

- Bottom-sheet drawer that mirrors the existing
  `components/dashboard/PostInsightsDrawer.jsx` pattern exactly: full-width
  panel anchored to the bottom of the viewport, `border-radius:
  rounded-t-3xl`, slides in via Framer Motion `initial={{ y: "100%" }}`
  → `animate={{ y: 0 }}` with a `spring damping: 32 stiffness: 380`
  transition. Backdrop is a separate `motion.div` with
  `background: rgba(15,23,42,0.25)` + `backdropFilter: blur(6px)`. A
  2px gradient top accent line (`#7C3AED → #EC4899 → #F97316`) sits
  above a centered drag-handle pill. The whole drawer caps at
  `maxHeight: 82vh` and scrolls internally.
- A diagnostic drawer is functionally a *cousin* of the existing
  insights drawer, so design parity matters: same header layout
  (thumbnail + caption preview + media-type pill + permalink ↗ + close
  ✕), same internal section spacing (`space-y-5`, `px-5 pb-8 pt-2`).
- Header: post thumbnail (square 56px) + caption preview + `permalink`
  out-link.
- Body:
  - `DiagnosticVerdictBlock` — short markdown verdict.
  - Observed vs baseline two-column metric strip (reach, engagement,
    save rate).
  - `DiagnosticFactorRow` per factor — severity icon + headline + expandable
    detail. Severity color: high=rose, medium=amber, low=slate, neutral=slate.
  - Recommendations markdown.
- States: idle, loading (spinner with "Diagnosing…"), error,
  `underperformed=false` (still render but show a "This post actually
  beat your baseline" banner so users learn from successes too).

### 3.5 `CaptionStudioDialog.jsx`

- Modal (max-w-2xl) with three vertical sections:
  1. **Draft input** — controlled `textarea`, format pill selector, optional
     topic hint input.
  2. **Submit row** — "Score draft" button; disable while in-flight; shows
     character count and a soft warning at the platform-respective limit
     (2200 chars for Instagram captions).
  3. **Results pane** — shown after first submission:
     - `CaptionScoreMeter` four-bar visualization (hook / CTA / length / overall).
     - `notes_md` rendered below.
     - Variants list — each variant a card with `CaptionDiffView` (uses
       a lightweight diff like `diff-match-patch` or inline highlight),
       copy button, "Use this" button (closes dialog, emits the new
       caption back via the `onAccept(caption)` prop — caller decides
       what to do with it).
- The dialog accepts `initialDraft` and `initialFormat` props so it can
  be launched pre-filled from a future "edit caption" flow.

### 3.6 `AskTheDataPanel.jsx` (deferred — v2)

Free-form Q&A. Tokens stream into `AIStreamSurface`. Keep the previous 5
turns in memory only (no persistence in v1). Behind a feature flag.

---

## 4. Hooks

All AI hooks follow the same shape as `useCompetitors`:
`{ data, loading, error, refresh, … }` plus feature-specific actions.

### 4.1 `useAIDigest(weekOf)`

```js
const { digest, loading, error, regenerate, isStreaming, streamingText }
  = useAIDigest(weekOf);
```

- On mount, GETs the digest. If `status === "generating"`, automatically
  opens an SSE connection to `/api/ai/digest/stream?week_of=...` and
  appends tokens into `streamingText`. When `event: done` arrives, swap
  to the final payload via a refetch.
- `regenerate()` POSTs to `/regenerate`, then re-enters the streaming
  flow. Refuses if the quota hook reports `used >= limit`.

### 4.2 `useContentIdeas({ days, limit })`

- GETs ideas; `refresh()` re-requests.
- `submitFeedback(idea_id, rating, note)` → POSTs to `/api/ai/feedback`
  with `feature: "ideas"`, `ref_id: idea_id`.

### 4.3 `usePostDiagnostic(igMediaId)`

- POSTs on hook mount when `igMediaId` is truthy; returns the diagnostic
  payload. Drawer closes → unmount → hook cancels in-flight request via
  AbortController.

### 4.4 `useCaptionStudio()`

- Exposes `score({ draft, format, topic_hint })` → returns the response
  promise. Caller stores last result in local state.
- No GET — caption submissions are ephemeral, not stored server-side.

### 4.5 `useAIQuota()`

- GETs `/api/ai/quota` on mount, polls every 5 min, and exposes
  `{ used, limit, resets_at, percentUsed, exhausted }`.
- Used by `AIQuotaBadge` and consulted by `useAIDigest.regenerate` to
  short-circuit if the user is at quota.

### 4.6 `useAIFeedback()`

- Generic POST helper for thumbs ratings; optimistic UI; rejects
  silently on duplicate ratings (server enforces idempotency by
  `feature+ref_id+user`).

---

## 5. Cross-cutting infrastructure

### 5.1 Streaming helper — `api/aiStream.js`

Wraps `fetch` with `ReadableStream`, parses SSE frames into events, and
exposes an async iterator:

```js
for await (const chunk of openAIStream("/ai/digest/stream", { week_of }))
  // chunk is { event: "token"|"done"|"error", data: string }
```

- Adds the bearer token from `localStorage` the same way `api/client.js`
  does, since axios doesn't help us with streams.
- On 401, calls the same logout-redirect path the axios interceptor uses
  — extract that into a shared `handleAuthExpired()` module so both
  interceptors and the stream helper call it.

### 5.2 Markdown rendering

Add `react-markdown` + `remark-gfm` (lightweight, ~30KB gzipped). Used
by `DigestNarrative`, `IdeaCard.body_md`, `DiagnosticVerdictBlock`,
`CaptionStudioDialog.notes_md`. One thin wrapper component
`<AIMarkdown>` so we can swap renderer later without touching call sites.

### 5.3 Caching strategy (FE side)

- React Query is **not** used in this codebase today (only ad-hoc hooks).
  Keep the same pattern — small `useGet`-style helpers with manual
  refresh — to stay consistent. Server caches the weekly digest by
  `(user_id, week_of)`; FE doesn't need a duplicate cache.
- `useAIDigest` should not auto-refetch on window focus or mount unless
  the current data is older than `generated_at + 6h`. This avoids
  burning quota when a user navigates between pages.

### 5.4 Cost / quota guardrails (FE)

- Disable `regenerate` and `submit` actions when
  `quota.used >= quota.limit`. Show a tooltip pointing to a future
  pricing page.
- Show `AIQuotaBadge` consistently in the Copilot page header and as a
  tiny indicator in `PostDiagnosticDrawer` + `CaptionStudioDialog`.
- Drawer and dialog should also display the per-action cost ("1 of your
  100 monthly AI calls") right before the user confirms an expensive
  action.

### 5.5 Empty states & error states

Reuse the project's existing visual idiom from `VoiceEmptyBanner.jsx`
and `InstagramNotConnectedBanner` (if present). Every AI surface needs:

- **Not enough data** — explicit copy about minimum sample requirements.
- **Quota exhausted** — disabled CTA + tooltip.
- **Network error** — retry button, no auto-retry storm.
- **LLM upstream error (5xx from backend)** — surface a friendly message;
  fall back to cached data when available.

### 5.6 Telemetry

Wire each AI surface to fire an event when it's rendered, when the user
clicks regenerate, when they accept a suggestion. Backend persists
these to a `ai_events` table. Keep payloads small — `feature`,
`action`, `ref_id`, `latency_ms`.

### 5.7 Accessibility

- All modals/drawers: focus trap, `Escape` to close, restore focus to
  trigger on close.
- Markdown content rendered with semantic headings, not styled divs.
- Streaming text regions: `aria-live="polite"`.
- Color-coded severities/factors: pair color with an icon + label so the
  signal isn't color-only.

### 5.8 Mobile / responsive

- `AICopilotPage` collapses to single column under `lg`; ideas grid
  drops from 3 → 2 → 1 columns.
- Drawer becomes a bottom sheet at `sm` breakpoint (full-width slide-up).
- Caption Studio dialog becomes full-screen at `sm`.

### 5.9 Theming

The dashboard is on a **light pastel** body (`background-color:
#fafafb`, `color: #0a0e27`) — the `@theme` block in `index.css` keeps a
dark `--color-surface*` set for legacy use, but the live dashboard
pages all sit on the light surface (verified in `DashboardLayout`,
`PageHeader`, `MediaCard`, `PostInsightsDrawer`). Copilot must match
this light surface, not the dark theme.

Hard rules:

- Use the existing light idiom — white cards with `rgba(0,0,0,0.05)`
  borders, `--shadow-soft` / `--shadow-lift` for elevation, slate-500
  / slate-600 text, violet/fuchsia accents (`#7C3AED`, `#EC4899`).
- Do **not** import landing-page-only classes (`glass`, `glass-strong`,
  `glass-subtle`, `text-gradient-aurora`, `btn-primary-glow`, `chip-soft`,
  `grid-pattern`, `aurora-bg`, `divider-glow`). They live under the
  `.lumen-landing` scope and rely on the landing's fonts/colors.
- The "AI shimmer" while streaming should be a **new** Tailwind keyframe
  added to `index.css`, scoped to a class like `.ai-shimmer` — see §13
  for the exact keyframe.
- The Copilot page uses the same `font-display` (Clash Display) for its
  H1 via `PageHeader`, and `Inter`/`font-sans` for body. The landing's
  Satoshi mapping is scoped under `.lumen-landing` and won't leak in.

---

## 6. Routing + auth wiring

In `App.jsx` (insert after the `/dashboard/competitors` route, keeping
the existing `ProtectedRoute` wrapper):

```jsx
import AICopilotPage from "./pages/AICopilotPage";
// …
<Route path="/dashboard/copilot" element={
  <ProtectedRoute>
    <AICopilotPage />
  </ProtectedRoute>
} />
```

`DashboardSidebar.jsx` — add to the `NAV_ITEMS` array (see §1.3 for the
full code including the `beta` pill rendering).

No new context providers are required. `PeriodComparatorContext` is
provided by `DashboardLayout` and is consumed only if `PageHeader` is
rendered with the default `showComparator={true}`. **Pass
`showComparator={false}` to `PageHeader` on `AICopilotPage`** — AI
features have their own period semantics (week-of for the digest,
`days` param for ideas). The comparator chip would be confusing on a
page where it has no effect.

`PostDiagnosticDrawer` and `CaptionStudioDialog` similarly do not depend
on `PeriodComparatorContext`. They can be mounted from any page —
including non-dashboard pages — so they must not assume the provider
exists; if a hook inside them touches `usePeriodComparator()`, the
component will crash on non-dashboard mounts. None of the diagnostic /
caption hooks read period context.

---

## 7. Phased delivery

Each phase is a shippable slice that doesn't depend on later phases.

### Phase A — Foundations (1 week)

1. Create `/copilot` route + sidebar entry + empty `AICopilotPage` shell.
2. Build `AIQuotaBadge` + `useAIQuota` against the quota endpoint.
3. Build `AIStreamSurface` + `api/aiStream.js`; verify with a mocked
   token-by-token endpoint in dev.
4. Add `react-markdown` + `<AIMarkdown>` wrapper. Verify XSS hardening
   (markdown source comes from our own backend, but still sanitize via
   `rehype-sanitize` since the LLM is non-deterministic).
5. Stub `useAIDigest`, `useContentIdeas`, `usePostDiagnostic`,
   `useCaptionStudio` returning fixtures so UI can be built without
   backend.

### Phase B — Weekly Digest (1 week)

1. `WeeklyDigestCard` static rendering (from fixture).
2. Streaming path: empty state → tokens stream in → final payload swap.
3. Bullets grid + followups + feedback buttons.
4. Regenerate button + quota check.
5. Wire to real backend endpoint.

### Phase C — Content Ideas (4–5 days)

1. `ContentIdeasPanel` static rendering (fixture).
2. Source-post strip with thumbnails (cross-link → Phase D drawer).
3. `IdeaCard` interactions (copy, feedback).
4. Adjacent toggle, period selector, refresh.
5. Wire to backend.

### Phase D — Post Diagnostic Drawer (4–5 days)

1. Build drawer shell + open/close from MediaCard + TopPosts.
2. Render verdict + factor rows + recommendations from fixture.
3. Wire `usePostDiagnostic` to backend with AbortController on unmount.
4. Cross-link from ContentIdeasPanel source posts (Phase C step 2).

### Phase E — Caption Studio Dialog (5–7 days)

1. Dialog shell with draft input + format pill.
2. Submit + score visualization.
3. Variant cards + diff view.
4. Wire to backend.
5. Add launch points (Copilot header, Reels Studio header).

### Phase F — Polish + telemetry (3–4 days)

1. Telemetry event firings end-to-end.
2. Accessibility audit (focus trap, aria-live, color-blind checks).
3. Mobile responsive pass on all four surfaces.
4. Friendly empty/error states finalized.
5. Quota-exhausted UX walkthrough.

**Total**: ~6 weeks of FE work assuming a single engineer and that the
backend endpoints land roughly in step.

---

## 8. Risks & open decisions
            
These need a call before Phase B starts.

1. **Streaming vs. non-streaming for the digest.** Streaming is great for
   perceived latency but doubles backend complexity. Default the plan to
   streaming-when-available; fall back to a single JSON payload if the
   backend can't ship SSE in time.
2. **Caption Studio launch points.** Right now creators don't paste captions
   into our app — captions live in Instagram. Two interpretations: (a)
   pre-publish helper they paste *into* before posting on IG, or (b)
   post-publish analyzer of captions we already have. The plan assumes
   (a). If we want (b), Caption Studio becomes a drawer launched per
   post, not a standalone dialog.
3. **Feedback persistence.** The plan stores thumbs feedback against
   `feature + ref_id`. For the weekly digest the natural `ref_id` is
   `week_of`. For free-form chat (v2) we need a turn-level ref_id —
   defer until v2 lands.
4. **Drafts integration.** `ContentIdeasPanel` mentions "Save to drafts."
   A drafts table doesn't exist yet. Either ship the button disabled
   with a "coming soon" tooltip or omit it from v1.
5. **Quota model.** The plan assumes a monthly per-user count. If
   pricing introduces per-feature limits ("10 caption studios + 5
   diagnostics + 4 digests"), the badge becomes per-feature and the
   gating logic in each hook grows. Lock this with product before
   building `AIQuotaBadge`.
6. **PII in LLM prompts.** Comments and captions can contain user PII.
   Backend should redact before prompting and document the policy.
   FE shows a one-time disclosure on first Copilot visit.

---

## 9. Definition of done

A Tier 4 feature is "done" when:

- The component renders all states (idle, loading, streaming, success,
  empty, error, quota-exhausted, not-connected).
- Backend endpoint responds with the shape documented in §2 and is
  reachable from the live dashboard.
- A user can complete the happy path on desktop and on mobile (≤375px).
- Telemetry events fire and land in the `ai_events` table.
- Feedback thumbs persist and are idempotent.
- The feature respects the user's AI quota; the regenerate / submit
  CTA disables at the limit.
- Documentation: `frontend/src/components/copilot/README.md` lists each
  component and the hook(s) it depends on. (One-paragraph entries.)

---

## 10. Component prop contracts

Exhaustive prop tables for every new component. Keep these stable
across the implementation — they are the seams that let UI work happen
in parallel with the hooks/backend.

### 10.1 `<AICopilotPage />`
No props. Self-mounts `useAIDigest()`, `useContentIdeas()`,
`useAIQuota()`. Owns the `captionStudioOpen` boolean it toggles into
`<CaptionStudioDialog />`.

### 10.2 `<WeeklyDigestCard />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `digest` | `WeeklyDigestResponse \| null` | yes | from `useAIDigest` |
| `loading` | `boolean` | yes | initial fetch only |
| `isStreaming` | `boolean` | yes | true while SSE tokens arrive |
| `streamingText` | `string` | yes | partial markdown accumulator |
| `quota` | `{ used, limit, exhausted }` | yes | read-only; controls regenerate disabled state |
| `onRegenerate` | `() => void` | yes | parent dispatches; child must not POST directly |
| `onFeedback` | `(rating: "up"\|"down", note?: string) => void` | yes | feature="digest", ref_id=week_of |
| `onCitationNav` | `(link: { route, query }) => void` | yes | parent owns React Router navigation |

### 10.3 `<DigestNarrative />`
Pure presentational; wraps `<AIMarkdown>`.
| prop | type | required | notes |
| --- | --- | --- | --- |
| `markdown` | `string` | yes | from `digest.narrative_md` or `streamingText` |
| `links` | `Array<{ id, route, query, label }>` | no | extracted citations from `digest.bullets` for `[ref:N]`-style anchors |
| `onLinkClick` | `(linkId: string) => void` | no | analytics hook |

### 10.4 `<ContentIdeasPanel />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `data` | `ContentIdeasResponse \| null` | yes | from `useContentIdeas` |
| `loading` | `boolean` | yes |  |
| `error` | `string \| null` | yes |  |
| `days` | `30 \| 90 \| 180` | yes | controlled |
| `onDaysChange` | `(days) => void` | yes | parent re-instantiates hook |
| `showAdjacentOnly` | `boolean` | yes | local toggle |
| `onShowAdjacentChange` | `(v) => void` | yes |  |
| `onRefresh` | `() => void` | yes | parent calls hook.refresh |
| `onIdeaFeedback` | `(ideaId, rating, note?) => void` | yes |  |
| `onSourcePostClick` | `(igMediaId) => void` | yes | opens diagnostic drawer |

### 10.5 `<IdeaCard />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `idea` | `Idea` | yes |  |
| `onCopy` | `(text: string) => void` | yes |  |
| `onFeedback` | `(rating, note?) => void` | yes |  |
| `onSaveDraft` | `() => void \| null` | no | absent → "Save" button rendered disabled with "Coming soon" tooltip |

### 10.6 `<PostDiagnosticDrawer />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `media` | `Media \| null` | yes | `null` collapses the drawer (mirrors `<PostInsightsDrawer>`) |
| `onClose` | `() => void` | yes |  |

Internally owns `usePostDiagnostic(media?.ig_media_id)`. Does *not*
accept a `diagnostic` prop — that is fetched on mount keyed by media ID,
so opening the drawer from any page just needs the media object.

### 10.7 `<CaptionStudioDialog />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `open` | `boolean` | yes |  |
| `onClose` | `() => void` | yes |  |
| `initialDraft` | `string` | no | default `""` |
| `initialFormat` | `"REELS"\|"CAROUSEL"\|"IMAGE"\|"STORY"` | no | default `"REELS"` |
| `initialTopicHint` | `string` | no |  |
| `onAccept` | `(caption: string) => void` | no | if absent, "Use this" copies to clipboard only |

### 10.8 `<AIQuotaBadge />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `variant` | `"compact" \| "verbose"` | no | default `"compact"` |
| `tooltip` | `boolean` | no | default `true` |

Reads `useAIQuota()` internally. `verbose` renders "12 of 100 AI calls
this month — resets May 31"; `compact` renders just "12 / 100".

### 10.9 `<AIFeedbackButtons />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `feature` | `string` | yes | e.g. `"digest"`, `"ideas"`, `"diagnostic"`, `"caption"` |
| `refId` | `string` | yes | unique per artifact (`week_of`, `idea.id`, `ig_media_id`, `caption-hash`) |
| `onSubmit` | `(rating, note?) => void` | yes |  |
| `submittedRating` | `"up"\|"down"\|null` | no | for optimistic UI replay |

### 10.10 `<AIStreamSurface />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `text` | `string` | yes | partial markdown |
| `isStreaming` | `boolean` | yes | controls cursor + shimmer |
| `renderer` | `"markdown" \| "plain"` | no | default `"markdown"` |
| `minHeight` | `number` | no | px; prevents layout shift while tokens arrive |

### 10.11 `<AIMarkdown />`
| prop | type | required | notes |
| --- | --- | --- | --- |
| `source` | `string` | yes |  |
| `linkComponent` | `Component` | no | default an internal anchor that calls `useNavigate` for `route:` links |
| `className` | `string` | no |  |

Always pipes through `rehype-sanitize` with the schema in §17.

---

## 11. Formal state machines

The four features have non-trivial async lifecycles. Implementations
should match these state diagrams exactly — every state listed is a
state the UI must render distinctly. No state should be silently
collapsed into "loading" or "error".

### 11.1 Weekly Digest

```
              ┌──────────────────────────────────────────────┐
              ▼                                              │
   ┌──────────────────┐  401 / 403   ┌────────────────┐      │
   │     idle         │─────────────▶│ auth_expired   │      │
   └────────┬─────────┘              └────────────────┘      │
            │ mount                                          │
            ▼                                                │
   ┌──────────────────┐                                      │
   │   loading        │──503/no_data──▶ insufficient_data    │
   └────────┬─────────┘                                      │
            │ 200                                            │
            ▼                                                │
   ┌──────────────────┐  status="generating"                 │
   │   ready_or_stream│──────────────────▶ streaming         │
   └────────┬─────────┘                          │           │
            │ status="ready"|"stale"             │           │
            ▼                                    ▼           │
   ┌──────────────────┐                ┌────────────────┐    │
   │   ready          │◀──event:done───│ streaming      │    │
   └────────┬─────────┘                └────────────────┘    │
            │ onRegenerate                                   │
            ▼                                                │
   ┌──────────────────┐                                      │
   │ regenerating     │──────────────────────────────────────┘
   └──────────────────┘   (loops back to streaming)
```

Per-state UI:

- **idle** — should not be visible; transient before first `useEffect`.
- **loading** — `<Skeleton>` blocks for narrative + bullets.
- **insufficient_data** — friendly empty banner: "Need ≥7 days of
  posting history before we can synthesize a weekly digest."
- **streaming** — `<AIStreamSurface text={streamingText} isStreaming />`
  with a blinking cursor at the end. Regenerate disabled.
- **ready** — full render. If `cached=true && now - generated_at > 6h`
  show "Last refreshed N hours ago" pill, regenerate enabled.
- **regenerating** — same UI as streaming but pre-existing content is
  visible *under* the new tokens with `opacity-50`; on `event:done`,
  swap atomically.
- **auth_expired** — handled by axios/stream interceptor → redirect
  to `/login`. UI should never get here while mounted.

Quota check: any transition from `idle | ready` → `regenerating` checks
`useAIQuota().exhausted` and aborts if true (UI surfaces the disabled
state with tooltip).

### 11.2 Content Ideas

```
   idle ──(mount)──▶ loading ──200──▶ ideas_ready
                       │              │
                       │ 200 empty    │ onRefresh / days change
                       ▼              ▼
                  no_themes_yet    refreshing ──▶ ideas_ready
                       │
                       │ days < 14 worth of data
                       ▼
                  insufficient_data
```

- **no_themes_yet** — backend returned `ideas: []` and `themes_detected: []`
  even though the period had posts. Copy: "We couldn't extract clear
  themes from this period. Try a longer window."
- **insufficient_data** — copy: "Not enough posts in the last {days}
  days to mine ideas from. Connect more posting history or wait a week."

### 11.3 Post Diagnostic

```
   closed ──(media set)──▶ opening (mount drawer animation)
              │
              ▼
           diagnosing ──200──▶ result ──onClose──▶ closed
              │   │
              │   └─422/400──▶ not_eligible (post too new, < 24h old)
              │
              └─500──▶ upstream_error ──onRetry──▶ diagnosing
```

- **not_eligible** — copy: "This post is too recent — diagnostics need
  ≥24h of insights data." Render the header but blank the body and show
  the message inline.
- **upstream_error** — copy: "We hit a snag analyzing this post. Try
  again in a moment." Retry button calls `usePostDiagnostic` `refresh`.

On `onClose`, the hook's AbortController fires; an in-flight POST is
cancelled before unmount.

### 11.4 Caption Studio

```
   closed ──(open=true)──▶ open_idle
                              │
                              │ user types
                              ▼
                           open_drafting
                              │
                              │ onScore() click
                              ▼
                           scoring ──200──▶ scored
                                    │
                                    └─429 quota──▶ quota_blocked
                                    │
                                    └─5xx──▶ scoring_error
   scored ──(user picks variant)──▶ scored_with_pick
                  │
                  │ "Use this"
                  ▼
           closed (parent onAccept)
```

- **open_idle** — empty textarea, score button disabled.
- **open_drafting** — score button enabled when `draft.length > 0` AND
  `draft.length <= 2200`. Over the limit, button stays clickable but
  shows the warning chip.
- **scoring** — submit row swaps to a spinner; textarea remains
  editable but score button disabled.
- **quota_blocked** — copy: "You've used your AI calls for this period.
  Resets {resets_at}." Score button hidden.

---

## 12. ASCII wireframes per surface

Sketch-level layouts. Use these to plan responsive collapse and
spacing, not for pixel-perfection.

### 12.1 `AICopilotPage` (desktop, lg)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ✦ Copilot                                          12 / 100   [ Caption ▾ ]│
│ Synthesizes your week and suggests what to make next.                      │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌──── Weekly Digest ─────────────────────────────────────────────── ↻ ──┐ │
│ │ Week of May 12 · cached 6h ago                                         │ │
│ │ ────────────────────────────────────────────────────────────────────── │ │
│ │ Markdown narrative (3-4 paragraphs, citations link into the dashboard) │ │
│ │ ────────────────────────────────────────────────────────────────────── │ │
│ │ ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────────┐                     │ │
│ │ │ ✓ Win  │ │ ⚠ Warn  │ │ ↗ Trend│ │ 🧪 Experiment │   followups: …    │ │
│ │ └────────┘ └─────────┘ └────────┘ └──────────────┘                     │ │
│ │                                                              👍 👎 ✎  │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ ┌──── Content Ideas ────────────────────────────────── [30][90▸][180] ↻ ─┐ │
│ │ Themes: #morning-routines  #carousel-tips  #behind-the-scenes  +2     │ │
│ │ Based on:  [⬜][⬜][⬜][⬜][⬜]   ☐ adjacent only                       │ │
│ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                    │ │
│ │ │ Idea card #1 │ │ Idea card #2 │ │ Idea card #3 │                    │ │
│ │ │ REELS · 95   │ │ CAROUSEL · A │ │ REELS · A    │                    │ │
│ │ └──────────────┘ └──────────────┘ └──────────────┘                    │ │
│ │ ┌──────────────┐ ┌──────────────┐                                     │ │
│ │ │ Idea card #4 │ │ Idea card #5 │                                     │ │
│ │ └──────────────┘ └──────────────┘                                     │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ ┌──── Ask the Data (v2, feature-flagged) ───────────────────────────────┐ │
│ │   Last 5 turns scroll …                                                │ │
│ │   ┌──────────────────────────────────────────┐  [send]                 │ │
│ │   │ Ask anything about your account…         │                         │ │
│ │   └──────────────────────────────────────────┘                         │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 `AICopilotPage` (mobile, sm)

```
┌─────────────────────────────┐
│ ✦ Copilot       12 / 100 ▾  │
│ Subtitle wraps              │
├─────────────────────────────┤
│ Weekly Digest          ↻    │
│ Week of May 12              │
│ narrative …                 │
│ [ ✓ Win   ]                 │
│ [ ⚠ Warn  ]                 │
│ [ ↗ Trend ]                 │
│ [ 🧪 Exp. ]                 │
│ followups: …                │
│ 👍 👎                       │
├─────────────────────────────┤
│ Ideas        [90▾]    ↻     │
│ themes chips wrap           │
│ thumbnails strip ↔          │
│ ┌──────────────────────┐    │
│ │ Idea 1               │    │
│ └──────────────────────┘    │
│ ┌──────────────────────┐    │
│ │ Idea 2               │    │
│ └──────────────────────┘    │
└─────────────────────────────┘
```

### 12.3 `PostDiagnosticDrawer` (bottom sheet, all viewports)

```
        ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  (backdrop, blurred)
┌──────────────────────────────────────────┐
│ ───── gradient accent ───── ╾╾╾╾╾╾╾╾╾╾╾╾╾│
│              ░░░  (drag handle)          │
│ ┌──┐ Caption preview lines 1-2        ✕ │
│ │  │ REELS · May 10 · View on IG ↗     │
│ └──┘                                     │
│ ─────────────────────────────────────── │
│ Observed         Baseline               │
│ Reach 4.2k       Reach 9.1k    ▼ -53%   │
│ ER    1.8%       ER    3.4%    ▼ -47%   │
│ Save  0.4%       Save  1.1%    ▼ -63%   │
│ ─────────────────────────────────────── │
│ Verdict                                  │
│ Markdown paragraph…                      │
│ ─────────────────────────────────────── │
│ Factors                                  │
│ ▣ HIGH    Timing  posted 3am (vs 11am)  ▾│
│ ▣ MED     Hashtag mix underperformed    ▾│
│ ▣ LOW     Format  carousel here vs reel ▾│
│ ─────────────────────────────────────── │
│ Recommendations                          │
│ Markdown bullets…                        │
│                                  👍 👎  │
└──────────────────────────────────────────┘
```

### 12.4 `CaptionStudioDialog`

```
┌──────────────── Caption Studio ─────────────────────────────┐
│ Format [ REELS ▾ ]  Topic hint [optional]              ✕  │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Draft your caption…                                  │  │
│ │                                                      │  │
│ │                                                      │  │
│ └──────────────────────────────────────────────────────┘  │
│                                  1,247 / 2,200            │
│                                       [ Score draft ▶ ]   │
│ ─────────────────────────────────────────────────────────│
│ Overall ████████░░ 78                                     │
│ Hook    █████████░ 88     Length ██████░░░░ 62            │
│ CTA     ███░░░░░░░ 31                                     │
│                                                            │
│ Notes (markdown)                                          │
│                                                            │
│ Variants                                                   │
│ ┌────────────────────────────────────────────────────┐    │
│ │ Punchier hook                                       │    │
│ │ diff view…                                          │    │
│ │                                  [Copy] [Use this]  │    │
│ └────────────────────────────────────────────────────┘    │
│ ┌────────────────────────────────────────────────────┐    │
│ │ Stronger CTA                                        │    │
│ └────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
```

---

## 13. Animation specs

All animation values are concrete. Match these exactly so the surfaces
feel consistent with the rest of the dashboard.

| Element | Library | Variants | Duration / spring | Easing | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| `WeeklyDigestCard` entry | Framer | `{opacity:0,y:12} → {opacity:1,y:0}` | spring `duration:0.45 bounce:0` | — | snap to final state |
| `IdeaCard` stagger | Framer | per-card `{opacity:0,y:14,filter:"blur(6px)"} → final` | spring `duration:0.42 bounce:0` `delay: index * 0.055` | — | no blur, no y, opacity only |
| `PostDiagnosticDrawer` slide-in | Framer | `{y:"100%"} → {y:0}` | spring `damping:32 stiffness:380` | — | `duration:0.18` linear |
| `PostDiagnosticDrawer` backdrop | Framer | `{opacity:0} → {opacity:1}` | `duration:0.2` | — | unchanged |
| `CaptionStudioDialog` open | Framer | `{opacity:0,y:12,scale:0.96} → {opacity:1,y:0,scale:1}` | spring `duration:0.35 bounce:0` | — | opacity only, no scale |
| Streaming cursor blink | CSS keyframe | `0%→50%→100%: opacity 1→0→1` | `1s infinite` | linear | hidden |
| `.ai-shimmer` background slide | CSS keyframe | `background-position: -200% 0 → 200% 0` | `2.4s infinite` | linear | static gradient, no animation |
| Severity row expand (factor detail) | Framer `<motion.div>` | `{height:0,opacity:0} → {height:"auto",opacity:1}` | `duration:0.22 ease:"easeOut"` | easeOut | swap to instant show |

Add the shimmer keyframe to `index.css`:

```css
@keyframes aiShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.ai-shimmer {
  background: linear-gradient(
    90deg,
    rgba(139,92,246,0.06) 0%,
    rgba(139,92,246,0.18) 50%,
    rgba(139,92,246,0.06) 100%
  );
  background-size: 200% 100%;
  animation: aiShimmer 2.4s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .ai-shimmer { animation: none; }
}
```

Reduced-motion: every Framer animation must call
`useReducedMotion()` (see existing `PostInsightsDrawer.jsx` for the
import) and fall back to the simpler path documented above. Test by
toggling OS setting before shipping.

---

## 14. Responsive specifications

Breakpoint table — column counts, layout collapses, and which
ornaments hide at narrower viewports.

### 14.1 `AICopilotPage`

| breakpoint | Digest bullets grid | Ideas grid | Source posts strip | Page padding |
| --- | --- | --- | --- | --- |
| `sm` < 640 | 1 col, stacked, full width | 1 col | scroll-x | `px-4 py-6` |
| `md` ≥ 640 | 2 cols | 2 cols | scroll-x | `px-6 py-7` |
| `lg` ≥ 1024 | 4 cols (win/warn/trend/exp) | 3 cols | inline | `px-8 py-8` |
| `xl` ≥ 1280 | 4 cols + roomier gaps | 3 cols | inline | unchanged |

Sidebar (`DashboardSidebar`) is `hidden lg:flex` already — on mobile,
no sidebar, no extra nav needed.

### 14.2 `PostDiagnosticDrawer`

Mirrors `PostInsightsDrawer`. Bottom-sheet across all breakpoints.
`maxHeight: 82vh`, internal scroll. On mobile, metric strip wraps;
factor rows are single-column always.

### 14.3 `CaptionStudioDialog`

| breakpoint | Width | Height | Variants grid |
| --- | --- | --- | --- |
| `sm` < 640 | full-screen | `100dvh`, internal scroll | 1 col |
| `md` ≥ 640 | `max-w-2xl` modal, centered | auto, max `85vh` | 1 col |
| `lg` ≥ 1024 | `max-w-3xl` modal | auto, max `80vh` | 2 cols of variants |

### 14.4 `AIQuotaBadge`

Compact pill: `12 / 100`. On mobile, sits as the sole header action
beside the title; on desktop, sits alongside the Caption Studio
button.

---

## 15. Copy deck (exact UI strings)

Centralize wording so the surfaces stay coherent and a future i18n
pass is mechanical.

### 15.1 Page meta

- Sidebar label: **Copilot** · Beta chip "BETA"
- Tab title (document.title): **Copilot · Lumen**
- `PageHeader.title`: **Copilot**
- `PageHeader.subtitle`: **Synthesizes your week and suggests what to make next.**

### 15.2 Weekly Digest

| State | Copy |
| --- | --- |
| Header (cached) | **Week of {Mon DD}** · Last refreshed {N}h ago |
| Header (fresh) | **Week of {Mon DD}** · Just synthesized |
| Insufficient data | We need at least 7 days of posting history before the weekly digest can find patterns. Post a few more times — we'll catch up. |
| Streaming placeholder | Synthesizing your week… |
| Regenerate button | ↻ Regenerate · 1 AI call |
| Regenerate disabled (quota) | At quota · Resets {date} |
| Bullet category labels | **Win** · **Heads up** · **Trend** · **Try this** |
| Followups header | Worth trying next |
| Feedback prompt (hover) | Was this digest useful? |

### 15.3 Content Ideas

| State | Copy |
| --- | --- |
| Empty themes | We couldn't extract clear themes from this period. Try a longer window. |
| Insufficient data | Not enough posts in the last {days} days to mine ideas from. Connect more posting history or wait a week. |
| Days selector labels | 30 days · 90 days · 180 days |
| Source strip header | Based on these top posts |
| Adjacent toggle | Show adjacent themes |
| Idea card footer | [📋 Copy] · [✦ Save to drafts] · 👍 👎 |
| Save-to-drafts (disabled) tooltip | Drafts coming soon |
| Refresh button | ↻ New ideas · 1 AI call |
| Adjacent badge | Adjacent theme |

### 15.4 Post Diagnostic

| State | Copy |
| --- | --- |
| Header | Diagnosing… |
| Verdict heading | Verdict |
| Observed/Baseline strip header | Compared to your baseline (last 60 posts) |
| Factor severity chips | HIGH · MEDIUM · LOW · NEUTRAL |
| Underperformed false banner | 🎉 This post actually beat your baseline. Here's why it worked. |
| Not-eligible | This post is too recent — diagnostics need ≥24h of insights data. |
| Upstream error | We hit a snag analyzing this post. [Try again] |
| Retry button | Try again |
| Recommendations heading | What to try next |

### 15.5 Caption Studio

| State | Copy |
| --- | --- |
| Dialog title | Caption Studio |
| Draft placeholder | Paste a draft caption to score and get variants… |
| Format pill default | REELS |
| Topic hint placeholder | Topic (optional) — e.g. "morning routine" |
| Submit | Score draft · 1 AI call |
| Submit disabled (empty) | Score draft |
| Char counter | {n} / 2,200 |
| Char warning (>2000) | Getting close to Instagram's 2,200 char limit. |
| Char over (>2200) | Over Instagram's 2,200 char limit — your caption will be truncated. |
| Score-bar labels | Hook · CTA · Length · Overall |
| Variants heading | Variants |
| Variant action buttons | [📋 Copy] · [✔ Use this] |
| Quota blocked | You've used your AI calls for this period. Resets {date}. |
| Server error | Couldn't analyze the caption. Try again in a moment. |

### 15.6 Cross-cutting

| Surface | Copy |
| --- | --- |
| `AIQuotaBadge` compact | {used} / {limit} |
| `AIQuotaBadge` verbose | {used} of {limit} AI calls this month · resets {date} |
| `AIQuotaBadge` exhausted tooltip | You've used all your AI calls. Resets {date}. |
| First-visit disclosure modal title | A quick note on Copilot |
| First-visit disclosure body | Copilot summarizes your post and comment data with an AI model. Captions and comments may be sent to that model. We do not share your data publicly or sell it. You can clear AI history at any time from Settings. |
| First-visit accept button | Got it |

---

## 16. Telemetry event catalog

All events POST to `/api/telemetry` (assumed existing pipeline; if
absent, batch-flush every 5 seconds via `navigator.sendBeacon`). Each
event has a small, stable shape.

```ts
TelemetryEvent = {
  ts: ISO8601,
  user_id: uuid,
  feature: "digest"|"ideas"|"diagnostic"|"caption"|"quota"|"copilot_nav",
  action: string,             // see catalog
  ref_id: string | null,      // week_of / idea.id / ig_media_id / caption-hash
  meta?: Record<string, any>, // small, no PII
  latency_ms?: number,
}
```

### Catalog

| feature | action | when fired | meta |
| --- | --- | --- | --- |
| copilot_nav | viewed | `AICopilotPage` mounts | source: "sidebar"\|"deeplink" |
| digest | rendered | digest first paints with `status` ∈ ready/stale | cached: bool, status |
| digest | regenerate_clicked | user clicks regenerate | quota_remaining |
| digest | regenerate_succeeded | stream `event:done` | latency_ms |
| digest | regenerate_failed | stream error | error_code |
| digest | bullet_link_clicked | citation anchor click | bullet_kind, route |
| digest | feedback_submitted | thumbs | rating, has_note: bool |
| ideas | rendered | ideas first paints | days, ideas_count |
| ideas | days_changed | period selector | from, to |
| ideas | refresh_clicked | refresh CTA | quota_remaining |
| ideas | idea_copied | clipboard copy | idea_id, format |
| ideas | source_post_opened | thumbnail click → diagnostic | ig_media_id |
| ideas | adjacent_toggled | toggle change | value: bool |
| ideas | feedback_submitted | thumbs | idea_id, rating |
| diagnostic | opened | drawer mounts with media | source: "MediaCard"\|"TopPosts"\|"Ideas"\|"FormatBreakdown" |
| diagnostic | rendered | response paints | underperformed: bool, factor_count |
| diagnostic | factor_expanded | row expand | factor_key |
| diagnostic | retry_clicked | retry CTA after error | — |
| diagnostic | feedback_submitted | thumbs | ig_media_id, rating |
| caption | opened | dialog mounts | source: "Copilot"\|"ReelsStudio"\|"ContentLab" |
| caption | scored | response paints | overall_score, draft_len |
| caption | variant_used | "Use this" click | variant_label |
| caption | variant_copied | "Copy" click | variant_label |
| caption | char_limit_exceeded | typed past 2200 | length |
| quota | exhausted_seen | regenerate/submit hit limit | feature |

---

## 17. Markdown sanitization spec

LLM output is non-deterministic — it can emit any HTML inside markdown
fenced blocks. Even if our backend filters, FE must defense-in-depth.

### Pipeline

```
backend_md → react-markdown
           → remark-gfm           (tables, strikethrough, autolinks, task lists)
           → rehype-raw           (parse inline HTML emitted by markdown)
           → rehype-sanitize      (allowlist below)
           → custom anchor renderer
           → render
```

### Allow list (`schema` passed to `rehype-sanitize`)

Tags: `p, br, strong, em, code, pre, ul, ol, li, blockquote, h1, h2, h3,
h4, a, hr, table, thead, tbody, tr, th, td, del, span`.

Attributes:

```js
{
  '*':    ['className'],
  a:      ['href', 'title', 'data-route', 'data-query'],
  span:   ['style'],
  code:   ['className'],
  pre:    ['className'],
}
```

`style` on `<span>` is allow-listed only to support inline color
emphasis the LLM emits via markdown; the inline style values are
filtered post-parse to allow only `color: #xxxxxx | rgb() | rgba()`.
No `background`, no `position`, no `url()`.

Anchor handler:

```jsx
function AIAnchor({ href, children, ...rest }) {
  const navigate = useNavigate();
  if (href?.startsWith("route:")) {
    const route = href.slice(6);
    return (
      <button
        type="button"
        className="text-violet-600 underline underline-offset-2"
        onClick={() => navigate(route)}
        {...rest}
      >
        {children}
      </button>
    );
  }
  // External — open in new tab, with rel guards.
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" {...rest}>
      {children}
    </a>
  );
}
```

Disallow: `<iframe>`, `<script>`, `<style>`, `<link>`, `<meta>`,
`<object>`, `<embed>`, `<form>`, `<input>`, `on*` event handlers
(stripped automatically by sanitize), `javascript:` / `data:` /
`vbscript:` URLs (stripped via custom URL filter).

---

## 18. Streaming wire format

Server-Sent Events over `text/event-stream`, one event per token batch
(don't emit per-character; batch in 50–150 ms windows server-side to
keep network overhead low). FE expects:

```
event: token
data: {"text":"Your save rate ","seq":1}

event: token
data: {"text":"dropped 18% ","seq":2}

event: meta
data: {"bullet_index":0,"kind":"win"}

event: done
data: {"week_of":"2026-05-18","generated_at":"2026-05-20T08:00:00Z"}

event: error
data: {"code":"upstream_timeout","message":"LLM provider timed out"}
```

### Event types

| event | data | FE handling |
| --- | --- | --- |
| `token` | `{ text: string, seq: int }` | append to `streamingText`; reject if `seq` out of order |
| `meta` | feature-specific | digest: marks the start of a bullet; ideas: marks the start of an idea; diagnostic: marks a factor row |
| `done` | full final payload | swap `streamingText` for the canonical render via a refetch or by hydrating from `data` |
| `error` | `{ code, message }` | abort stream, surface friendly copy keyed off `code` |
| `keepalive` | empty | proxies sometimes need this every 15s to keep the connection alive; ignore |

### Reconnection rules

- The SSE helper in `api/aiStream.js` should **not** auto-reconnect on
  abrupt close; AI streams are one-shot. Surface "Connection dropped —
  retry?" to the user.
- On `event: error` with `code: "auth_expired"`, call the shared
  `handleAuthExpired()` (see §5.1) → logout + redirect.
- On `code: "quota_exhausted"`, refetch `useAIQuota()` so the badge
  updates immediately.

### Bearer token

Axios cannot stream — use `fetch` directly. Build the request:

```js
const token = localStorage.getItem("access_token");
const res = await fetch(`/api/ai/digest/stream?week_of=${weekOf}`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: abortController.signal,
});
```

Stream is parsed via `res.body.getReader()` + `TextDecoder` + an
SSE frame parser (split on `\n\n`, parse `event:` / `data:` lines).

---

## 19. Fixture data shapes

Phase A delivers stubbed hooks returning these fixtures so the UI work
proceeds without backend. Store under
`frontend/src/api/__fixtures__/ai/` and import into the hook stubs.

### 19.1 `digest.json`

```json
{
  "week_of": "2026-05-12",
  "generated_at": "2026-05-19T08:14:00Z",
  "status": "ready",
  "cached": true,
  "narrative_md": "Your **save rate dropped 18%** this week, driven by carousel posts about [productivity tips](route:/dashboard/content?format=CAROUSEL). On the upside, your Reel on [morning routines](route:/dashboard/reels) outperformed your average reach by **3.2×** — strong candidate for a series.\n\nFollower quality stayed flat. Posting cadence drifted to 11pm — earlier in the day still wins on reach for your audience.",
  "bullets": [
    {
      "kind": "win",
      "headline": "Morning Routine Reel hit 3.2× avg reach",
      "detail_md": "Reach 42.1k vs your 60-day median of 13.2k. Hook was a direct question; replicate the framing.",
      "link": { "route": "/dashboard/reels", "query": {} }
    },
    {
      "kind": "warning",
      "headline": "Carousel save rate ↓ 18% WoW",
      "detail_md": "Your save rate on carousels was 0.9% (vs 1.1% prior week). Topic shift from tactical → motivational correlates with the drop.",
      "link": { "route": "/dashboard/content", "query": { "format": "CAROUSEL" } }
    },
    {
      "kind": "trend",
      "headline": "Audience time-of-day shifting later",
      "detail_md": "Engagement peak moved from 8pm to 9:30pm. Consider testing later slots.",
      "link": null
    },
    {
      "kind": "experiment",
      "headline": "Try a 3-part Reel series on morning routines",
      "detail_md": "Your top post this week was on this theme. A series will compound retention.",
      "link": null
    }
  ],
  "metrics_snapshot": {
    "save_rate_pct_delta": -18.0,
    "reach_pct_delta": 12.3,
    "follows_delta": 247,
    "posts_count": 6
  },
  "followups": [
    "Pin the morning-routine Reel to your grid",
    "Cut the carousel topic that flopped from this week's plan"
  ]
}
```

### 19.2 `ideas.json`

```json
{
  "period_days": 90,
  "generated_at": "2026-05-19T08:14:00Z",
  "source_posts": [
    { "ig_media_id": "17891234567890", "permalink": "https://instagram.com/p/abc", "thumbnail_url": "https://…", "caption_preview": "Morning routine for…", "algorithm_score_pct": 92 },
    { "ig_media_id": "17891234567891", "permalink": "https://instagram.com/p/def", "thumbnail_url": "https://…", "caption_preview": "Carousel: 5 productivity…", "algorithm_score_pct": 78 }
  ],
  "themes_detected": [
    "morning-routines",
    "carousel-tips",
    "behind-the-scenes",
    "productivity-stack",
    "creator-economy"
  ],
  "ideas": [
    {
      "id": "idea_01",
      "title": "Series: 'My 5am Routine, Honestly'",
      "body_md": "A 3-part Reel series breaking your morning into Hour 1 / Hour 2 / Hour 3. Lean into the contradictions — viewers reward honesty over aspiration.",
      "suggested_format": "REELS",
      "rationale": "Your top 2 posts in the last 90 days were morning-routine Reels with average reach 3.2× baseline.",
      "adjacent": false
    },
    {
      "id": "idea_02",
      "title": "Carousel: 'Why I quit X productivity tool'",
      "body_md": "Frame it as a teardown, slide by slide. Strong save bait because viewers will revisit.",
      "suggested_format": "CAROUSEL",
      "rationale": "Carousel saves spike when the topic is opinionated and granular.",
      "adjacent": false
    },
    {
      "id": "idea_03",
      "title": "Reel: 'I tried [creator]'s schedule for a week'",
      "body_md": "Borrowed-authority hook; you've never posted this format.",
      "suggested_format": "REELS",
      "rationale": "Adjacent theme: experiment / lifestyle borrow. Underrepresented in your feed but rewards the productivity audience.",
      "adjacent": true
    }
  ]
}
```

### 19.3 `diagnostic.json`

```json
{
  "ig_media_id": "17891234567890",
  "baseline": { "avg_reach": 9100, "avg_engagement_rate_pct": 3.4, "avg_save_rate_pct": 1.1 },
  "observed": { "avg_reach": 4280, "avg_engagement_rate_pct": 1.8, "avg_save_rate_pct": 0.4 },
  "underperformed": true,
  "verdict_md": "**Timing was the dominant factor.** Posted at 3:14am, which is your weakest window — your audience is 73% USA-based and skews 9am–11am.",
  "factors": [
    {
      "key": "timing",
      "severity": "high",
      "headline": "Posted at 3am — your audience's worst window",
      "detail_md": "Posts published 2–5am have averaged 38% of your median reach over the last 60 posts.",
      "evidence": { "metric": "reach_pct_vs_median", "value": 38, "comparison": "median window 100%" }
    },
    {
      "key": "hashtags",
      "severity": "medium",
      "headline": "Hashtag mix skewed broad",
      "detail_md": "5 of 8 hashtags have a >2M post count — your reach correlates better with 200k–2M tags.",
      "evidence": { "metric": "avg_hashtag_size", "value": 3_400_000, "comparison": "best-performing band" }
    },
    {
      "key": "format",
      "severity": "low",
      "headline": "Carousel — slightly suboptimal here",
      "detail_md": "For this topic, your Reels outperform Carousels 2.1×; not the main issue, but worth noting.",
      "evidence": { "metric": "format_lift_vs_reel", "value": 0.47, "comparison": "1.0 = reel baseline" }
    }
  ],
  "recommendations_md": "- Repost the core idea as a Reel during your 10am window.\n- Trade 2-3 of the largest hashtags for niche tags in the 200k–1M range.\n- Lead with the conclusion in the cover slide; viewers swipe further when they're hooked first."
}
```

### 19.4 `caption.json`

```json
{
  "draft": "5 things I learned from posting daily for a year. Thread below.",
  "scores": { "hook_strength": 72, "cta_presence": 28, "length_fit": 58, "overall": 53 },
  "variants": [
    {
      "id": "v1",
      "label": "Punchier hook",
      "caption": "Posting daily for a year almost broke me. Here are 5 things I'd do differently. ↓",
      "rationale": "Stronger emotional lead; replaces a generic numeric hook with a vulnerability angle."
    },
    {
      "id": "v2",
      "label": "Stronger CTA",
      "caption": "5 things I learned from posting daily for a year. Which surprised you? Drop a number in comments.",
      "rationale": "Comment prompt with a low-friction reply mechanic."
    }
  ],
  "notes_md": "Your hook reads as a familiar 'X things I learned' pattern — fine, but the **CTA is missing**. Captions on your account with explicit comment prompts get 1.8× more replies."
}
```

### 19.5 `quota.json`

```json
{ "used": 12, "limit": 100, "resets_at": "2026-06-01T00:00:00Z" }
```

---

## 20. Manual QA checklist

There is no test suite in this repo. Replace tests with a manual
checklist that must pass before each surface ships. Run on the dev
server (`npm run dev`) with the backend stubbed by fixtures.

### 20.1 Weekly Digest

- [ ] Cold load → skeleton → final render in < 1.5s with cached payload.
- [ ] `status: "generating"` → tokens stream visibly; cursor blinks.
- [ ] Regenerate while quota remaining → existing content greys, stream
      overlays, swap is atomic, no double-render.
- [ ] Regenerate while quota exhausted → button disabled, tooltip shows.
- [ ] Citation link inside narrative → navigates inside the React Router
      app (no full reload), back button restores Copilot.
- [ ] Feedback thumbs → immediate UI flip, second click is no-op.
- [ ] Insufficient-data state visible when fixture sets
      `status: "not_enough_data"`.
- [ ] Reduced motion: blur/y entry replaced by opacity-only.

### 20.2 Content Ideas

- [ ] Days selector switch → loading state visible briefly, then new
      data.
- [ ] Empty themes state renders with friendly copy when ideas array
      is empty.
- [ ] Source post thumbnail click → diagnostic drawer opens for that
      media ID (not a new tab).
- [ ] Adjacent-only toggle hides non-adjacent cards.
- [ ] "Save to drafts" button is disabled and shows "Coming soon"
      tooltip (drafts table doesn't exist yet).
- [ ] Copy button puts the markdown body into the clipboard; toast
      confirms.

### 20.3 Post Diagnostic Drawer

- [ ] Opens from `MediaCard` overflow menu.
- [ ] Opens from `TopPostsTable` (or `TopPostsGrid`) row icon.
- [ ] Opens from `FormatBreakdownPosts` row when implemented.
- [ ] Drag handle visible; backdrop click closes.
- [ ] Escape closes; focus returns to trigger.
- [ ] In-flight request cancels on close (no console warning, no
      delayed state set).
- [ ] `underperformed: false` shows the "🎉 beat your baseline" banner
      with appropriate verbiage.
- [ ] Factor row expand/collapse animates within 220ms.
- [ ] `not_eligible` (422 from backend) renders the friendly inline
      message, not an error toast.

### 20.4 Caption Studio

- [ ] Opens from Copilot header button.
- [ ] Opens from Reels Studio page header.
- [ ] Char counter ticks live; warning chip appears at ≥2000; over-
      limit chip appears at >2200.
- [ ] Score button disabled when draft empty.
- [ ] Score in-flight → submit row spinner; textarea remains editable.
- [ ] Variants render after success; "Use this" emits `onAccept` (when
      caller passes one) and closes; otherwise copies to clipboard.
- [ ] Mobile: dialog goes full-screen, internal scroll behaves.
- [ ] Reduced motion: scale animation suppressed; opacity only.

### 20.5 Cross-cutting

- [ ] Quota badge polls every 5 minutes; updates after a regenerate or
      caption submit.
- [ ] First-visit disclosure modal shows exactly once per user; persists
      via `localStorage` key `ai_disclosure_acked_v1`.
- [ ] All AI markdown surfaces sanitize HTML — a fixture with `<script
      onerror="alert(1)">` should render as plain text.
- [ ] Streaming dropped mid-flight (kill backend) → friendly retry
      surface, not a console error spew.
- [ ] 401 mid-stream → logout + redirect to `/login`.
- [ ] Lighthouse a11y score ≥ 95 on `/dashboard/copilot`.

---

## 21. Performance budget

Hard limits for the four surfaces.

| Metric | Target | Notes |
| --- | --- | --- |
| Copilot route bundle (JS, gzipped) | ≤ 35 KB net-new | react-markdown + remark-gfm + rehype-sanitize together ~30 KB; rest is component code |
| LCP on `/dashboard/copilot` (cold) | ≤ 1.8s on broadband, ≤ 3s on Fast 3G | server returns digest from cache instantly |
| Streaming first token latency | ≤ 600 ms p50, ≤ 1.5 s p95 | measured backend wall-clock; surface to the user as "Synthesizing your week…" |
| Total digest stream duration | ≤ 8 s p95 | server-side token batching to 50–150 ms windows |
| Diagnostic request latency | ≤ 4 s p95 | non-streaming |
| Caption studio score latency | ≤ 3 s p95 | non-streaming |
| Drawer open animation jank | 60fps on M1 / Pixel 7 | profile with React DevTools Profiler |
| Largest single API payload | ≤ 60 KB | digest with 4 bullets + narrative; cap `narrative_md` length backend-side |

Bundle size verification: after Phase A, run `npm run build` and
inspect `dist/assets/*.js` sizes — add `vite-bundle-visualizer` if
needed. If `react-markdown` ecosystem blows the budget, fall back to
`marked` + `DOMPurify` (smaller but slightly different rendering
fidelity).

---

## 22. Accessibility checklist (per surface)

| Item | Digest | Ideas | Diagnostic | Caption |
| --- | :-: | :-: | :-: | :-: |
| Semantic landmark (`<section aria-labelledby>`) | ✓ | ✓ | ✓ (dialog) | ✓ (dialog) |
| Heading hierarchy h1 → h2 → h3, no skips | ✓ | ✓ | ✓ | ✓ |
| Focus trap when modal/drawer open | — | — | ✓ | ✓ |
| Escape closes | — | — | ✓ | ✓ |
| Focus returns to trigger on close | — | — | ✓ | ✓ |
| `aria-live="polite"` on streaming region | ✓ | — | — | — |
| `aria-busy="true"` on the section while loading | ✓ | ✓ | ✓ | ✓ |
| Icons paired with text label (not color-only) | ✓ | ✓ | ✓ | ✓ |
| Severity not encoded by color alone | — | — | ✓ (icon + label) | — |
| Keyboard-only walkthrough verified | ✓ | ✓ | ✓ | ✓ |
| `prefers-reduced-motion` respected | ✓ | ✓ | ✓ | ✓ |
| Form labels associated via `htmlFor` | — | — | — | ✓ |
| Color contrast AA (text on bg ≥ 4.5:1) | ✓ | ✓ | ✓ | ✓ |
| Sanitized links open with `rel="noopener noreferrer"` | ✓ | ✓ | ✓ | ✓ |

For the streaming region:

```jsx
<div
  className="ai-stream"
  aria-live="polite"
  aria-atomic="false"
  aria-busy={isStreaming}
>
  {streamingText}
  {isStreaming && <span className="caret">▍</span>}
</div>
```

`aria-atomic="false"` so screen readers announce new chunks, not the
whole region each time.

---

## 23. Privacy & disclosure

LLM features process user-generated content (captions, comments).
Add an explicit disclosure surface and a settings escape hatch.

### 23.1 First-visit modal

Triggered the first time the authenticated user hits any AI surface
(Copilot page, Diagnostic drawer, or Caption Studio). Stored as
`localStorage.setItem("ai_disclosure_acked_v1", new Date().toISOString())`.

Copy is in §15.6.

### 23.2 Settings hook

Add a settings page (or extend an existing one) with a single toggle
"Use my data with AI features" — default ON, off → all four hooks
short-circuit with `disabled: true` and surfaces show a banner
explaining the toggle is off.

A separate "Clear AI history" button POSTs to
`/api/ai/clear-history` and removes any cached server-side syntheses.

### 23.3 What we do **not** display

The frontend must not log raw caption text or comment text to
`console.log`. The telemetry payloads in §16 explicitly avoid PII —
only ref IDs, never content. Code review checkpoint.

---

## 24. Feature-flag plan

Each AI surface ships behind a flag so we can roll out per-cohort.

```ts
// frontend/src/utils/featureFlags.js
export const FLAGS = {
  ai_digest:     true,
  ai_ideas:      true,
  ai_diagnostic: true,
  ai_caption:    true,
  ai_ask:        false,  // v2
};
```

Initial implementation: hardcoded constants gated by an env var
(`VITE_AI_FLAGS_OVERRIDE`) and a `user.experiments` array returned by
`/api/auth/me`. Sidebar item hides entirely when **all** four flags are
off. The page renders a "This feature isn't available on your account
yet" notice if a user deep-links to `/dashboard/copilot` while flags
are off.

Mount-point gates:

- `MediaCard` overflow menu hides "Diagnose this post" when
  `ai_diagnostic` is false.
- `ReelsStudioPage` Caption Studio button hides when `ai_caption` is
  false.
- `AICopilotPage` renders only the panels whose flag is on. If all are
  off but the user has the route, show the deep-link notice.

---

## 25. Dependency / build graph

Visual reference of what depends on what. Useful for parallelizing
Phase B–E.

```
                   ┌──────────────────┐
                   │  api/aiStream.js │  (Phase A)
                   └────────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │useAIDigest│  │useAIQuota│  │AIStreamSurface│
        └─────┬────┘  └────┬─────┘  └──────┬───────┘
              │            │               │
              └────┐  ┌────┘               │
                   ▼  ▼                    │
           ┌────────────────────┐          │
           │  WeeklyDigestCard  │──────────┘
           └────────┬───────────┘
                    │
                    ▼
              AICopilotPage
                    ▲
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────────────┐         ┌─────────────────┐
│useContentIdeas│         │ AskTheDataPanel │ (v2)
└──────┬────────┘         └─────────────────┘
       │
       ▼
┌────────────────────┐         ┌──────────────────┐
│ ContentIdeasPanel  │────────▶│PostDiagnosticDrawer│
└────────────────────┘  (cross │                  │
                         link) │                  │
                               └────┬─────────────┘
                                    │
                                    ▼
                            usePostDiagnostic

CaptionStudioDialog ◀── opened from Copilot header / Reels Studio
        │
        ▼
useCaptionStudio
        │
        ▼
api/aiStream.js (optional — only if backend streams variants)
```

Critical paths (must land first):

1. `api/aiStream.js` + `useAIQuota` + `AIMarkdown` wrapper (§17 sanitization).
2. `AIStreamSurface` (used by Digest + Ideas + Diagnostic streaming variants).
3. `WeeklyDigestCard` is the first user-facing surface, so it gates the
   rest of the page bringup.

---

## 26. Error taxonomy

Backend errors should map to FE state and copy via a stable code field.
Build a single `mapErrorCode(code) → { copy, retryable }` helper in
`utils/aiErrors.js`.

| code | http | retryable | user copy |
| --- | --- | --- | --- |
| `auth_expired` | 401 | no | (silent → redirect to /login) |
| `forbidden` | 403 | no | Your plan doesn't include AI features. |
| `quota_exhausted` | 429 | no | You've used your AI calls for this period. Resets {date}. |
| `not_enough_data` | 422 | no | Not enough data yet. Keep posting and check back. |
| `media_not_eligible` | 422 | no | This post is too recent — diagnostics need ≥24h. |
| `upstream_timeout` | 504 | yes | We took too long synthesizing this. Try again. |
| `upstream_error` | 502 | yes | The AI provider hiccuped. Try again in a moment. |
| `cancelled` | client | no | (silent) |
| `network` | client | yes | Connection dropped. Retry? |
| `unknown` | 500 | yes | Something went wrong. Try again. |

Retryable errors render an inline "Try again" CTA. Non-retryable errors
hide the CTA.

---

## 27. Empty-state component (shared)

Recurring across all four surfaces — extract once.

```jsx
// components/copilot/AIEmptyState.jsx
function AIEmptyState({ icon: Icon, title, body, cta }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200
                    bg-slate-50/60 px-6 py-8 text-center space-y-2">
      <Icon size={20} className="mx-auto text-slate-400" />
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
        {body}
      </p>
      {cta}
    </div>
  );
}
```

Used by: digest insufficient_data, ideas insufficient_data, diagnostic
not_eligible, caption quota_blocked. Keeps visual language uniform.

---

## 28. Open questions for product / design

Items not resolved by this plan that need a decision before final
implementation:

1. **Where does the Caption Studio actually compose into?** "Use this"
   currently calls `onAccept(caption)` then closes. Without a drafts
   table, the caller has nowhere to write the caption. Decisions:
   (a) ship Use-this as a copy-to-clipboard with a toast in v1,
   (b) postpone Use-this until a drafts feature lands.
2. **Should the Weekly Digest auto-trigger an email on Monday?** The
   roadmap (`instagram-analytics-roadmap.md` §N.18) lists email + Slack
   digest channels. This plan is in-app only — email is a backend
   addition.
3. **Quota model granularity.** §8.5 already flagged this — per-user
   monthly count vs. per-feature counts. Locks the `AIQuotaBadge`
   variants and the gating logic.
4. **Free-form Ask-the-Data.** Deferred to v2. Wire the flag now, but
   don't build the panel until digest + ideas + diagnostic + caption
   have shipped and we have feedback signal.
5. **Idea card "Save to drafts."** Render disabled vs. omit entirely.
   This plan defaults to disabled-with-tooltip for discoverability.
6. **Streaming for Caption Studio.** Variants could stream, but
   variants are small (a few sentences) — streaming is more friction
   than benefit. Plan keeps caption non-streaming.

---

## 29. Glossary

- **Adjacent theme** — a content theme the user hasn't posted about
  but that the LLM judges proximate to their existing themes.
- **Algorithm score** — existing metric in this codebase
  (`/insights/algorithm-metrics`) — a 0–100 composite of save rate,
  share rate, and view-through.
- **Baseline** — for diagnostics, the rolling 60-post median for the
  user's account.
- **Bullet kind** — `win | warning | trend | experiment` — the four
  semantic colors used by the Weekly Digest.
- **Period semantics** — Copilot uses `week_of` (digest) and
  `days` (ideas) independently of the dashboard's
  `PeriodComparatorContext`.
- **Quota** — monthly per-user AI call count. Resets at the first of
  the calendar month UTC.
- **Ref ID** — stable identifier per AI artifact for telemetry and
  feedback (`week_of`, `idea.id`, `ig_media_id`, hash of
  `(draft, format)` for caption variants).

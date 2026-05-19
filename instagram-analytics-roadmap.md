# Instagram Analytics — Roadmap & Net-New Feature Ideas

Companion document to `instagram-analytics-feature-research.md`. Audits what's already shipped against that doc, proposes a prioritized build order for what's left, and adds a list of net-new features the research doc did **not** cover.

---

## 1. Current Status vs Research Doc

Mapped each feature from `instagram-analytics-feature-research.md` against the codebase as it exists today.

### Tier 1 — Done

| # | Feature | Status | Backend endpoint | Frontend |
|---|---------|--------|------------------|----------|
| 1 | Content-Format Performance Breakdown | ✅ Done | `/insights/format-breakdown` (+ `/posts` drill-down) | `ContentLabPage` → `FormatBreakdownChart` |
| 2 | Best Time to Post (personalized) | ✅ Done | `/insights/best-time` (+ `/posts`) | `ContentLabPage` → `BestTimeHeatmap` |
| 3 | Save Rate / Share Rate / Algorithm Score | ✅ Done | `/insights/algorithm-metrics` | `ContentLabPage` → `AlgorithmScorePanel` |
| 4 | Reels Retention & Drop-Off | ✅ Done | `/insights/reels-retention` + `/trend` | `ReelsStudioPage` → `ReelsRetentionTable`, `HookStrengthTrend` |
| 5 | Follower Quality Score | ✅ Done | `/insights/follower-quality` + `/summary` + `/spikes` | `AudienceDNAPage` → `QualityRadar`, `CohortQualityTable`, `SpikeTimeline` |

**Tier 1 is fully shipped.** The wedge against native Insights is in place.

### Tier 2 — Mostly open

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6 | Period-over-Period Comparisons | ❌ Not built | `PeriodSelector` exists but only filters one period. No A-vs-B comparison view. |
| 7 | Hashtag Performance Tracking | ❌ Not built | Captions are stored; tag extraction + per-tag aggregation queries are needed. |
| 8 | Competitor Benchmarking | ❌ Not built | Requires new ingestion pipeline; daily snapshots of public Business accounts. |
| 9 | Comment Sentiment & Topic Analysis | ❌ Not built | Comments are not even fetched yet — need `GET /<MEDIA_ID>/comments` sync. |
| 10 | Audience Growth Drivers | 🟡 Partial | `follower-quality/spikes` flags suspicious growth but doesn't attribute to posts. |

### Tier 3 — Monetization (not started)

| # | Feature | Status |
|---|---------|--------|
| 11 | Auto-Generated Media Kit | ❌ Not built |
| 12 | Rate Card Recommendations | ❌ Not built |
| 13 | Brand Deal / Campaign Tracking | ❌ Not built |
| 14 | UTM / Link-Click Attribution | ❌ Not built |

### Tier 4 — AI Layer (not started)

| # | Feature | Status |
|---|---------|--------|
| 15 | Weekly AI Insights Digest | ❌ Not built |
| 16 | Content Idea Generator from Performance | ❌ Not built |
| 17 | "Why did this post flop?" Diagnostic | ❌ Not built |
| 18 | Caption A/B Suggestions | ❌ Not built |

### Tier 5 — Cross-Platform (intentionally deferred)

Not built. The research doc itself advises depth over breadth — keep deferred until Tier 2/3 features are landed.

---

## 2. Recommended Build Plan

The research doc proposed an order optimized for low-cost wins. Tier 1 is done, so the proposed phasing below picks up from there.

### Phase A — Finish the "moat" features (≈4–5 weeks)

These are the highest-leverage features still missing and are pure SQL on data already in ClickHouse.

| Order | Feature | Effort | Why now |
|-------|---------|--------|---------|
| A.1 | **Period-over-Period Comparisons** | 1 week | Largest single moat against native Insights — uses the long-term ClickHouse retention you already pay for. Add an A/B period selector, % deltas on every existing card, and a statistical-significance flag. |
| A.2 | **Audience Growth Drivers** (post → follower attribution) | 1 week | Extends existing `spikes` endpoint. Join daily follow counts with same-day high-reach posts. |
| A.3 | **Hashtag Performance** | 1 week | Pure SQL — extract hashtags from stored `caption` field, group by hashtag, aggregate engagement. Defer the Graph API hashtag-search until usage justifies the rate-limit budget. |
| A.4 | **Empty-state & onboarding polish on Tier 1 features** | 3–5 days | Best Time + Algorithm Score already work, but new users hit empty states before sync finishes. Add explicit "Sync in progress" and "Need ≥ N posts" copy across every card. |

**Outcome:** the dashboard becomes meaningfully more useful than native Insights for any creator with > 90 days of history.

### Phase B — Differentiated qualitative & competitive (≈6 weeks)

Move from "better numbers" to "answers a creator can't get anywhere else."

| Order | Feature | Effort | Why now |
|-------|---------|--------|---------|
| B.1 | **Comment Sentiment & Topic Analysis** | 2 weeks | Need a comments sync job + nightly LLM batch for sentiment/embeddings. Genuinely differentiated vs cheap-tier competitors. Use Claude Haiku 4.5 for sentiment (cheap) and embeddings for clustering. |
| B.2 | **Competitor Benchmarking** | 3 weeks | New ingestion pipeline (daily snapshot of 3–10 public Business handles per user). Build the data model first, then the side-by-side dashboard. Most-requested missing feature per the research doc. |
| B.3 | **CSV / data export** (net-new — see §3) | 3 days | Power users churn out when they can't export. Easy to ship; high retention payoff. |

### Phase C — Monetization tier (≈4–5 weeks)

First paid-tier features. Pick **one** of these as the wedge, not all three.

| Option | Feature | Effort | Best if… |
|--------|---------|--------|----------|
| C.1 | **Auto-Generated Media Kit** | 2 weeks | …your audience is solo creators pitching brands. Table-stakes, sharp ROI per user. |
| C.2 | **Brand Deal / Campaign Tracking** | 3 weeks | …you want to become a "creator CRM." Higher LTV but slower to land. |
| C.3 | **Rate Card Recommendations** | 1 week (data) + ongoing benchmark sourcing | …you can credibly source/cite industry-rate benchmarks. Otherwise the suggestions feel arbitrary and erode trust. |

**Recommendation:** ship C.1 first. Lowest risk, highest pickup, and the public-mediakit URL is itself a growth loop.

### Phase D — AI advisor layer (≈4–6 weeks)

Only worth building **after** Phases A and B, because the AI's value is synthesis across rich metrics. Without comment sentiment + competitor benchmarks, the digest will say obvious things.

| Order | Feature | Effort | Notes |
|-------|---------|--------|-------|
| D.1 | **Weekly AI Insights Digest** | 2 weeks | Scheduled job. Use Sonnet 4.6 with prompt caching on the user's metric history. Output: 5-bullet plain-English summary, in-app + email. |
| D.2 | **"Why did this post flop?" Diagnostic** | 1.5 weeks | Triggered per-post. Pulls baseline, compares format/time/topic/hashtags, returns a structured ranked diagnostic. |
| D.3 | **Content Idea Generator** | 1 week | Embedding-driven theme extraction from top 10 posts → LLM idea generation. |
| D.4 | **Caption A/B Suggestions** | 1.5 weeks | Pre-publish UX. Compare draft to top-performing captions for the same account; suggest specific edits. |

### What to deliberately skip

Carrying over from the research doc — these remain weak bets:
- Generic "trending hashtag" suggestions
- Real-time per-comment push notifications
- Influencer marketplace / discovery (different product)
- Pre-publish virality prediction (easy to ship, hard to be right)

---

## 3. Net-New Feature Ideas (Not in Research Doc)

Features beyond the original research doc, ranked by leverage. Each notes whether the data already exists in ClickHouse.

### Quick wins (data already stored)

| # | Feature | Effort | Description |
|---|---------|--------|-------------|
| N.1 | **CSV / Excel export per page** | 2–3 days | One "Download" button per dashboard view that exports the underlying rows. Critical for power users / agency reporting. Net-new buyer signal. |
| N.2 | **Engagement-velocity curve** | 1 week | "Engagements in the first hour" as a real-time virality indicator. Compare per-post velocity against the account's median; flag outliers. Uses existing media_insights — requires a one-time sync of "1h" snapshots if not already captured. Worth checking if Meta exposes hourly buckets. |
| N.3 | **Posting-cadence health card** | 3 days | Median gap between posts, posting-frequency-vs-engagement curve, warning when cadence drifts. Pure SQL on `instagram_media.timestamp`. |
| N.4 | **Caption-hook analyzer (own data)** | 1 week | Extract the first sentence/line of each caption; group by hook pattern ("Question?", "Bold claim.", "Number listicle", …) and aggregate engagement. The output is the user's *own* top-performing hooks, not generic advice. |
| N.5 | **Comment response rate** | 3 days | Once comments are synced (Phase B.1), report % of comments the creator replied to, plus correlation with follower-growth velocity. Strong "behavior nudge" insight. |
| N.6 | **Story funnel viz** | 1 week | Stories already have taps_forward / taps_back / exits / replies in `media_insights`. Render the funnel — drop-off per slide — same data, new dashboard tile. |
| N.7 | **Day-of-week consistency score** | 2 days | How consistent is posting by weekday? Reveals "you post 4× on Sundays then radio silence" patterns. |
| N.8 | **Goal tracking** | 1 week | User sets "10k followers by Dec 31" or "5% save rate". Progress bar, ETA based on current trajectory, weekly check-in. Lightweight CRM-ish surface. |
| N.9 | **Year-over-year self-comparison ribbon** | 3 days | A persistent "This June vs Last June" badge on every metric card. Cheap, but only your product can show it (90-day Meta cliff). |

### Medium-effort, high-leverage

| # | Feature | Effort | Description |
|---|---------|--------|-------------|
| N.10 | **Reel audio / sound tracking** | 1–2 weeks | Capture `music_metadata` on Reels (available in Graph API), then aggregate per-sound performance. "This audio gave you 3× your median reach." |
| N.11 | **Cohort follower retention** | 2 weeks | Do followers gained in Jan still engage in Jun? Requires per-day follower snapshot + engaged-audience overlap. Brand-trust gold — proves "real audience." |
| N.12 | **Topic clustering of own posts** | 1.5 weeks | Embedding-driven clustering of captions/comments to surface *the creator's actual content themes* and engagement per theme. Pairs naturally with Tier-4 idea generator. |
| N.13 | **Post-mortem on outliers** | 1 week | Auto-trigger when a post exceeds 2× baseline reach. Deep-dive page: which signals lit up, who shared it, demographic delta vs baseline. Mirror of "why did this flop." |
| N.14 | **Anomaly alerts (weekly digest, not real-time)** | 1 week | Build on N.13 trigger logic but for drops. Surfaces "your Reels reach dropped 40% week-over-week — candidate causes: …". Avoids the real-time notification trap. |
| N.15 | **Saved views / custom queries** | 2 weeks | Let users save filtered combinations ("Reels, last 30d, hashtag=#abc") as named views. Foundation for shareable dashboards. |

### Strategic / platform-level

| # | Feature | Effort | Description |
|---|---------|--------|-------------|
| N.16 | **Multi-account / agency view** | 3–4 weeks | The research doc's moat #3. Switch between connected accounts; roll up metrics across them; per-account permissions. Different buyer (agencies) and pricing tier. Big fork in product direction. |
| N.17 | **Public share-link per metric / per post** | 1 week | "Send a brand my engagement rate on this Reel" → public URL with auto-refreshed numbers, expiring or open. Growth loop. Pairs with the Media Kit feature. |
| N.18 | **Email + Slack digest channels** | 1 week | Same content as in-app digest (Tier 4 D.1), but delivered. Slack integration in particular is sticky for agencies. |
| N.19 | **Per-user API token** | 2 weeks | Expose the user's own ClickHouse data via a thin authenticated API. Power-user lock-in; also enables third-party plugin ecosystem. |
| N.20 | **Audience overlap with competitors** | 3+ weeks (carefully) | If/when competitor benchmarking exists, *only public* engaged-audience demographics overlap. Be conservative with the framing — never claim individual identification. |

### Risky / dual-edged (think before building)

- **Bot-follower detection beyond spikes** — engagement velocity + demographic anomalies. Easy to be wrong; lawsuit-adjacent for falsely accusing creators. Frame as "audience quality score" without naming the failure mode.
- **Burnout / posting-frequency-drop nudges** — opinionated; can feel invasive. Only ship if explicitly opted in.
- **Caption auto-rewrite that posts directly to IG** — large surface area for things to go wrong publicly. Keep AI suggestions advisory, never auto-publishing.

---

## 4. Suggested Single-Quarter Plan (if forced to pick)

If you have one engineer for ~12 weeks and want maximum retention impact:

1. **Weeks 1–2** — Period-over-Period (A.1) + Y/Y ribbon (N.9). Establishes the historical-retention moat in the UI.
2. **Weeks 3–4** — Audience Growth Drivers (A.2) + Posting-cadence card (N.3) + CSV export (N.1). Quick wins that strengthen the existing pages.
3. **Weeks 5–7** — Comments sync + Comment Sentiment (B.1) + Comment response rate (N.5). Genuinely differentiated qualitative layer.
4. **Weeks 8–10** — Weekly AI Insights Digest (D.1). Synthesizes all the metrics now available into the "advisor" voice.
5. **Weeks 11–12** — Media Kit (C.1). First paid-tier wedge; doubles as a growth loop via public URLs.

This sequence intentionally pushes Competitor Benchmarking past the quarter — it's a 3-week ingestion project that doesn't compound with the other features the way the sequence above does.

---

## 5. Positioning Carryover

From the research doc — restated because the build plan above is chosen to deliver on these:

1. **Historical retention beyond 90 days** — Phase A makes this visible (period comparisons, Y/Y ribbon).
2. **AI synthesis layer** — Phase D leverages the rich metric base built in Phases A–B; do it last so the AI has something non-obvious to say.
3. **Cross-account / agency view** — separate fork. Decide explicitly before building C.2/C.3 whether the buyer is solo creator or agency.

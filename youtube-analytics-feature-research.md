# Advanced Analytics Features for Your YouTube Creator Dashboard

A research-backed roadmap of what to build for the YouTube side of the platform, ranked by creator impact and grouped by theme. Each feature notes whether it is achievable via the YouTube Data API v3, the YouTube Analytics & Reporting API, computed from your stored data, or requires a third-party data source.

The Instagram side already exists in this codebase (see `instagram-analytics-feature-research.md`). This document assumes you're starting the YouTube integration from scratch and want it to launch with feature parity to (or ahead of) the Instagram experience — not behind it.

---

## Starting Point — What the YouTube APIs Give You

Before listing features, the API surface you'll be working with:

- **YouTube Data API v3** — channels, videos, playlists, comments, search. OAuth scope: `youtube.readonly`. Free quota: 10,000 units/day per project. Most reads cost 1 unit; `search.list` costs **100** units — design around that.
- **YouTube Analytics API v2** — query-style API for per-video/per-channel metrics with dimensions (day, country, traffic source, device, age group, etc.). Scope: `yt-analytics.readonly`. Higher quota than the Data API and the only place you get watch-time, retention, traffic sources, and demographics.
- **YouTube Reporting API** — bulk daily CSV dumps of pre-computed reports (good for backfill and audit, painful for low-latency dashboards). Scope: `yt-analytics.readonly`.
- **YouTube Analytics — Monetary metrics** — `estimatedRevenue`, `estimatedAdRevenue`, `estimatedRedPartnerRevenue`, `cpm`, `playbackBasedCpm`, `monetizedPlaybacks`. Requires `yt-analytics-monetary.readonly` and only works for channels in the YouTube Partner Program.
- **OAuth flow** — Google OAuth 2.0; the same access token can be scoped for multiple APIs.

**Hard limits to internalize:**
- Quota is per-project, not per-user. With many users on one app, you must batch and cache aggressively, or apply for a quota increase.
- Some metrics are **not** available at the per-video grain (e.g., demographics are channel-level by default).
- "Realtime" YouTube metrics lag 1–2 days for most aggregates; only the dedicated `realtime` endpoint in YT Studio returns last-48-hour estimates.
- Revenue data is delayed and reconciled monthly — show "estimated" labels prominently.

---

## Foundation Layer — Build This First (Pre-Feature)

Before any of the "wow" features, the YouTube side needs the same backbone your Instagram side already has. Without these, every feature below is hand-wavy.

### F1. OAuth + Channel Connection
Google OAuth → store refresh token (encrypted, same crypto module as the IG long-lived token) → discover the user's primary channel via `channels.list?part=snippet,statistics&mine=true`. If the user owns multiple channels (brand accounts), let them pick which to connect.

### F2. Video & Channel Sync to ClickHouse
Mirror what `instagram_repo` does:
- `youtube_channel` table — snapshot of `viewCount`, `subscriberCount`, `videoCount`, branding metadata, `hiddenSubscriberCount` flag
- `youtube_video` table — `videoId`, `title`, `description`, `tags`, `publishedAt`, `duration` (parse ISO 8601), `categoryId`, `defaultLanguage`, `thumbnailUrl`, `liveBroadcastContent`, `madeForKids`, `privacyStatus`, plus rolling `viewCount/likeCount/commentCount/favoriteCount`
- `youtube_video_format` derived field: `SHORT` (duration ≤ 60s **and** vertical) vs `LONG_FORM` vs `LIVE` vs `PREMIERE` — YouTube doesn't tag Shorts explicitly in the Data API; you derive it.

### F3. Analytics Sync Job (Background Task)
Equivalent of your `_run_insights_sync`. Pull from YT Analytics API:
- Per-channel daily totals (views, watch time minutes, subscribers gained/lost, estimated revenue)
- Per-video lifetime + per-day metrics
- Audience retention curves per video
- Traffic source breakdown per video
- Demographics (channel-level: age, gender, country)

Store as time-series rows in `ReplacingMergeTree` just like your IG insights tables.

### F4. The 90-Day Retention Promise — Applied to YouTube
YouTube Studio itself keeps data indefinitely, so the "90-day cliff" pitch from Instagram doesn't apply identically. Reframe the YouTube moat as:
1. **Cross-platform unified view** with your IG data
2. **Faster comparison UI** than YT Studio (which is sluggish for >90 day ranges)
3. **AI-synthesized narratives** YT Studio doesn't ship
4. **Granular historical archiving** that survives even if a video is deleted (Studio loses analytics for deleted videos)

---

## Tier 1 — Highest Impact (Build These First)

### 1. Audience Retention Curve Analysis
This is *the* defining YouTube metric. Native Studio shows the retention graph for one video at a time — but never lets you compare hooks across videos, find your average drop-off point, or detect patterns.

**What to compute (from YT Analytics API `audienceWatchRatio` and `relativeRetentionPerformance`):**
- **First-15-second retention** (hook strength) — averaged across your library and trended over time
- **Drop-off cliffs** — auto-detect timestamps where >10% of viewers leave within 5 seconds (catches bad transitions, awkward sponsor reads, weak mid-roll setup)
- **Replay/rewatch peaks** — `audienceWatchRatio > 1.0` segments where viewers rewound
- **Retention vs benchmark** — `relativeRetentionPerformance` tells you how a video retained *vs YouTube videos of similar length in the same category*; surface this as "above/below YouTube benchmark"
- **Side-by-side curve comparison** — pick 3 videos, overlay their retention curves

**Why it matters:** Retention is the strongest input to the YouTube algorithm. No third-party tool meaningfully innovates here. Pure analytics on data the API hands you.

**New endpoint suggestion:** `GET /api/youtube/insights/retention/{video_id}` and `GET /api/youtube/insights/retention/aggregate?days=90`

---

### 2. Click-Through Rate (CTR) Intelligence
Thumbnails + titles drive impressions → clicks. Native Studio shows CTR but doesn't help you understand it. Compute:

- **CTR distribution** — your videos plotted against the channel median and the YouTube category benchmark (~2–10% depending on niche)
- **CTR vs duration** — do your 8-minute videos out-CTR your 25-minute videos? (Common pattern)
- **Thumbnail age decay** — does CTR drop sharply after week 1? (Signals the thumbnail isn't pulling on browse anymore)
- **Top performers by impressions** — which thumbnails earned the most *impressions* (not just clicks)? That signals algorithm trust
- **CTR-by-traffic-source** — high CTR on "Browse features" but low on "Suggested videos" tells you the thumbnail wins on the homepage but loses next to other creators' thumbnails

**Data source:** `cardClickRate`, `cardImpressions`, `impressions`, `impressionClickThroughRate` from YT Analytics API. Free, no third-party data needed.

---

### 3. Watch Time per Video & Channel Trend
Watch time, not view count, is what the algorithm rewards and what monetization tracks. Build dashboard tiles that lead with:

- **Total watch hours** for the period, with delta vs prior period
- **Average view duration (AVD)** trend — are your videos holding viewers longer over time?
- **Watch time per upload** — your output ROI metric
- **Hours to next monetization tier** — countdown to YPP eligibility (4,000 public watch hours + 1,000 subs in 12 months), or to Shorts monetization (1,000 subs + 10M Shorts views in 90 days). Surfacing this is genuinely useful to mid-tier creators.
- **Watch time by content format** — Shorts vs long-form vs livestream

**Why it matters:** YT Studio buries some of these. The "hours until next milestone" framing is unique to creator dashboards.

---

### 4. Shorts vs Long-Form Performance Split
YouTube's 2024–2026 push made Shorts a distinct algorithm with separate monetization and discovery. Yet most analytics tools mash them together.

**What to compute:**
- Side-by-side metrics: views, watch time, subscribers gained, revenue per **Shorts vs long-form vs livestream**
- **Shorts-to-subscriber conversion rate** — Shorts that produced subs (`subscribersGained` filtered to short-form videos)
- **Long-form lift from Shorts** — when a Short goes viral, does your long-form watch time spike in the following 7 days? (This is one of the most-debated YouTube questions; you can finally answer it for *your* channel.)
- **Shorts revenue share** — Shorts use a different revenue pool; surface it explicitly

**Data source:** YT Analytics API, filtered by derived video format.

---

### 5. Traffic Source Breakdown
Knowing *how* viewers found a video is half the job of optimization. YT Studio shows this, but only one video at a time.

**What to compute (from `insightTrafficSourceType` dimension):**
- Per-video and aggregate breakdown across: **YT_SEARCH, SUGGESTED_VIDEO, BROWSE, EXTERNAL, NOTIFICATION, PLAYLIST, END_SCREEN, SHORTS, NO_LINK_OTHER**
- **Search dependence ratio** — what % of your views come from search? (High = SEO-driven channel; low = algorithm-driven channel; both are valid but the strategy differs)
- **Top external referrers** — which sites/apps drive views? (Twitter, Reddit, your own blog?)
- **Suggested video winners** — which of *your* videos drive views to your other videos? (Internal pipeline mapping)

This is foundational for any creator strategy conversation and underexploited by current tools.

---

## Tier 2 — High Impact (Build These Next)

### 6. Search Term & Keyword Intelligence
YT Analytics exposes `insightTrafficSourceDetail` for search traffic — the actual queries that brought viewers in.

- **Top search queries** driving views to each video and the channel overall
- **Long-tail vs head queries** — diversification health
- **Unintended ranking** — queries you rank for that you didn't target (often the most valuable insight)
- **Query → CTR → AVD funnel** per keyword (where do search viewers drop off?)
- **Suggested next topics** — LLM-extracted themes from your top queries

This is genuinely differentiated. TubeBuddy and vidIQ sell weaker versions of this as paid features.

---

### 7. Subscriber Source Attribution
Where do your subscribers actually come from? YT Analytics has `subscribersGained` and `subscribersLost` by:
- Video (which video earned the sub)
- Traffic source
- Country/device

**What to surface:**
- "Subscriber-driving videos" — your top 10 sub-generating uploads
- **Subscribers-per-view rate** per video (high-converting hooks)
- **Net subscriber chart** with annotations: did unsubs spike when you posted that controversial video?
- **Sub churn cohorts** — unfollows by acquisition month (do subs from Shorts churn faster than subs from long-form?)

---

### 8. Revenue & RPM Breakdown (YPP Channels)
For monetized creators, this is the most important section of the entire dashboard.

**Metrics from `yt-analytics-monetary.readonly`:**
- `estimatedRevenue`, `estimatedAdRevenue`, `estimatedRedPartnerRevenue` (YouTube Premium share), `playbackBasedCpm`, `cpm`, `monetizedPlaybacks`
- **RPM per video** — your true revenue rate per 1,000 views
- **Revenue by traffic source** — search viewers may monetize at very different RPMs than Shorts feed viewers
- **Revenue by geography** — US/UK/AU/CA viewers earn multiples of tier-3 countries; understanding the mix helps creators target content
- **Revenue forecast** — simple linear projection for end of month (clearly labeled as estimate)
- **Revenue per video format** — Shorts ad pool ≠ long-form ad pool ≠ Premium revenue
- **Top-earning videos lifetime** (separate from top-viewed)

Add prominent disclaimers: numbers are estimates, final amounts settle in AdSense, and a single takedown/copyright claim can retroactively change the numbers.

---

### 9. Period-over-Period Comparisons
Same pitch as the Instagram side: a clean "this 30 days vs prior 30 days vs same month last year" surface across all metrics. YT Studio's date picker is slow and clunky for this — your moat is making it instant.

- Side-by-side period comparison
- Percentage deltas on every metric (with significance highlighting)
- Year-over-year mode that survives Studio's painful date picker UX
- **Anomaly callouts** — auto-highlight metrics that moved >2σ from the channel's baseline

---

### 10. Comment Sentiment, Topic & Toxicity Analysis
You already have the pattern from the Instagram research doc. YouTube comments are richer, often longer, and the threads (with `parentId`) carry conversation signal.

- **Sentiment** distribution per video and trended over time
- **Topics** clustered via embeddings — "viewers keep asking about X, that's your next video"
- **Questions detected** — surface them as a "FAQ video opportunity" inbox
- **Toxicity flagging** — Google's Perspective API integrates cleanly here; surface a "moderation queue" for creators with engaged but spicy comment sections
- **Reply rate** — which videos do *you* engage on? Correlate with retention performance on the next upload (the YouTube algorithm rewards channels with engaged creators)

Pull via `commentThreads.list` + `comments.list`. Watch quota: 1 unit per call, 100 results per page.

---

### 11. End Screen, Card & Pinned-Comment Performance
Most creators set end screens once and forget them. Surface:
- **End-screen element CTR** per video (`annotationClickThroughRate`, `cardClickRate`)
- **Best-performing end-screen target** — which "next video" suggestion converts best across the library?
- **Pinned-comment engagement** — track replies/likes on pinned comments as a soft engagement signal

This is genuinely under-tooled. YT Studio shows it but creators rarely look.

---

### 12. Audience Demographics & Geography Deep Dive
YT Analytics gives you:
- `ageGroup` (age13-17, age18-24, …), `gender`, `country`, `province` (US only)
- Crossed with `deviceType`, `operatingSystem`

Build a richer demographics surface than Instagram's because YouTube exposes much more granularity:
- **Country revenue mix** for monetized creators (high-RPM countries vs view-share)
- **Device split** — mobile-dominant audiences need different thumbnails (text legibility on small screens)
- **Live-vs-replay split for live streams**

---

### 13. Competitor / Channel Benchmarking
The public-API version of this is more permissive than Instagram's. From the Data API on any public channel:
- `subscriberCount`, `viewCount`, `videoCount` (snapshot daily)
- Upload cadence (videos per week, average duration)
- Public engagement on recent uploads (`viewCount`, `likeCount`, `commentCount` per video — `dislikeCount` is no longer returned)
- Implied AVD/retention is **not** available for other channels — be honest about the limit

**Product cut:**
- User adds 3–10 competitor channels
- Daily polling (cheap: ~3 quota units per channel)
- Side-by-side: subscriber growth rate, posting cadence, top-performing videos by inferred metrics
- "Niche median" curve — useful framing without making absolute claims

---

## Tier 3 — Monetization & Brand-Deal Features

### 14. Auto-Generated Media Kit (Cross-Platform)
On YouTube specifically, brands want to see:
- Subscriber count, average views per video, AVD
- Top videos with thumbnails + viewer counts
- Demographics and geography
- Historical RPM if the creator chooses to share it (toggle)
- Brand-deal case studies (pulled from the campaign tracker, see #16)

Generate a branded PDF and a shareable URL (`yourapp.com/mediakit/<creator>`) that combines IG + YT in one document. This is a stronger pitch than any single-platform tool.

---

### 15. Sponsor Segment Performance ("Mid-Roll Drop-Off")
This is **uniquely YouTube** and very high-value. Sponsors pay creators $$$$ but never get told *how their segment actually performed*.

Using retention data:
- Creator marks the timestamp range of a sponsor read (`0:42–1:35`)
- Compute the retention loss across that window vs the channel's baseline drop-off at similar timestamps
- Generate a "sponsor segment report": "82% of viewers watched through the sponsor segment, vs 78% baseline for that timestamp range. Length: 53 seconds. Estimated impressions: 14,520."

Brands will pay for this report. Creators will pitch better deals because of it. This is a genuinely novel feature with strong willingness-to-pay.

---

### 16. Brand Deal / Campaign Tracking (Cross-Platform)
Mirror what you'd build for IG but adapted to YouTube:
- Mark a video as `sponsored` with brand, deal value, deliverables, sponsor segment timestamps
- Auto-generate a post-campaign report (views, watch time, demographics, sponsor-segment retention, comment sentiment)
- Lifetime brand-deal revenue, ROI per brand, brands worth pitching again

The cross-platform angle is the wedge: a creator running an IG + YT campaign for the same brand wants *one* report.

---

### 17. Rate Card Recommendations (YouTube-Aware)
YouTube pricing inputs differ from Instagram. Compute:
- Sub count + average views + AVD + niche → suggested rate range
- Format multipliers: dedicated video > integration > Shorts mention > end-screen mention
- Tiered ranges with disclaimers about exclusivity, usage rights, and category demand

Seed niche benchmarks from public datasets (Influencer Marketing Hub, Tubular Labs reports). Be conservative with claims.

---

### 18. Membership & Super Chat / Super Thanks Tracking
For channels with Memberships enabled or live streams that get Super Chat:
- Membership count over time, MRR, churn
- Per-tier breakdown
- Super Chat revenue per livestream
- Top supporters list (with privacy toggle)

Available via YT Analytics' `estimatedRedPartnerRevenue` and via the Memberships API (limited; restricted access from Google).

---

## Tier 4 — AI Layer (Where You Differentiate)

### 19. Weekly AI Insights Digest (YouTube Edition)
Monday-morning synthesis tailored to YouTube's mental model:

> *"Your AVD dropped 14% this week, driven by your last two long-form uploads being 4 minutes longer than your channel sweet spot. The Short you posted Tuesday earned 38% of your weekly subs — consider 2x weekly Shorts cadence. Your search traffic from "[topic]" tripled; you don't have a recent video targeting that query."*

LLMs are good at this kind of multi-metric narrative. YT Studio doesn't do it.

### 20. Title & Thumbnail A/B Suggestions
YouTube launched native A/B testing for thumbnails in 2024 but limits it. Build:
- Pre-publish: paste a draft title + thumbnail, AI compares to your top performers and flags weaknesses (title length, curiosity gap, color contrast on thumbnail, face/no-face)
- Post-publish: 24-hour CTR check vs the creator's median — auto-suggest a thumbnail swap if it underperforms

### 21. "Why Did This Video Flop?" Diagnostic
Structured root-cause analysis when a video performs below baseline:
- Was it CTR? (Thumbnail vs channel median)
- Was it AVD/retention? (Drop-off cliffs flagged with timestamps)
- Was it traffic source mix? (No browse traffic = algorithm didn't pick it up)
- Was it timing? (Posted at low-engagement hour for your audience)
- Was it topic? (Comment sentiment / topic clustering)

### 22. Content Idea Generator from Search Demand
Combine the creator's top search queries (#6) + their top-performing topics + comment-question clustering (#10) → produce a ranked list of next-video ideas with predicted upside framing ("This topic appears in 38 of your unanswered comments and has a search-volume trend you don't currently rank for"). Crucially, *don't* claim to predict views — that erodes trust.

### 23. Chapter & Description Optimizer
LLM scans the video transcript (via `captions.download`) and suggests:
- Optimal YouTube chapters (timestamps + titles)
- Description-first-150-chars rewrite (SEO-critical)
- Tag suggestions based on top search queries
- Pinned comment draft

This pairs nicely with retention analysis — chapters can be aligned to known drop-off cliffs.

---

## Tier 5 — Cross-Platform (Where the Real Moat Lives)

The Instagram research doc treated cross-platform as "future." Once both IG and YT exist in your app, **the unified surface is your strongest differentiator** because no incumbent tool nails both equally:

- **Unified content calendar** — schedule and tag posts across both platforms
- **Cross-platform performance comparison** — engagement-rate-normalized so the numbers are comparable
- **Audience overlap inference** — comment authors that appear on both your IG and YT (where usernames match or via opt-in linking)
- **Content republishing tracker** — when you cross-post a Reel to Shorts, compare performance on each
- **Single-pane brand-deal reporting** combining both platforms

Worth thinking about now even though you'll build it later, because some Tier 1/2 schema choices (e.g., a unified `campaigns` table) should anticipate it.

---

## What I Would NOT Build

- **"Viral score" predictions before publishing** — same trust problem as on Instagram; YouTube has even higher variance
- **Tag spam suggestions** — YouTube tags are nearly weightless in the modern algorithm; pushing creators to spend time on them is bad advice
- **"Best length for YouTube videos" generic advice** — varies wildly by niche; your *personalized* AVD analysis is the right framing
- **Subscriber-buying / sub4sub detection as a feature** — too easy to false-positive on legitimate growth spikes
- **Live-stream chat overlay tools** — different product surface (real-time streaming), don't conflate with analytics
- **Replacing YouTube Studio's video editor / publishing flow** — out of scope and the API doesn't let you do most of it well

---

## Suggested Build Order

Assuming you start the YouTube integration after Instagram is stable, and want to ship value within ~8 weeks:

1. **F1–F3 Foundation** (2 weeks) — OAuth, channel/video sync, analytics background job
2. **Watch time + view count dashboard** (3 days) — the table-stakes hero cards
3. **Audience retention analysis** (1 week) — the killer YouTube feature
4. **CTR intelligence** (4 days) — pairs with retention
5. **Shorts vs long-form split** (3 days) — pure SQL on existing data
6. **Traffic source breakdown** (3 days) — same
7. **Period-over-period comparisons** (1 week)
8. **Revenue dashboard** (1 week, monetized creators only) — first paid-tier wedge
9. **Search term intelligence** (1 week) — high differentiation
10. **Sponsor segment performance** (1.5 weeks) — your *novel* feature, hard for competitors to copy
11. **AI weekly digest** (1.5 weeks) — ties it together

The earliest exclusive paid-tier features should be (8) revenue dashboard, (10) sponsor segment performance, and (11) AI digest — they're the strongest "I can't get this in YT Studio" pitches.

---

## A Note on Positioning vs YouTube Studio

Unlike Instagram (where the native Insights app is genuinely thin), **YouTube Studio is a serious product**. Your moats are narrower and need to be sharper:

1. **Cross-platform unification** — Studio is YT-only; you cover IG + YT in one place
2. **Speed and modern UX** — Studio is sluggish for large date ranges, hides too much behind clicks
3. **AI synthesis & narrative** — Studio surfaces metrics; you tell stories
4. **Brand-deal & monetization workflows** — Studio is creator-facing only; you address the creator-as-business
5. **Sponsor segment & campaign reporting** — Studio simply doesn't do this

Don't try to out-Studio Studio at raw analytics depth. Pick the three or four moats above and execute them ruthlessly.

---

## Quota & Cost Reality Check

Two things that will bite you if you ignore them:

- **API quota.** A naive implementation hits the 10,000 unit/day default ceiling within 50–100 active users. Apply for a quota increase early (Google approves them for legitimate analytics apps, but it takes 1–4 weeks). In the meantime, aggressively cache channel/video metadata (24h TTL) and rate-limit live syncs.
- **LLM cost.** The AI features above can run on cheap models for most tasks (summarization, clustering) and reserve the strongest models (Gemini Pro / Claude Opus / GPT-class) for the weekly digest and "why did this flop" diagnostic. Batch comment-sentiment work nightly rather than on every dashboard load; cache by content hash.

Both are solvable, but neither is automatic — bake them into your architecture choices early.

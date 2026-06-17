# DATA_FLOW.md

> End-to-end traces for every major data object — from external API / DB origin, through transformation and state, to the rendered component. Format: `origin → API → transform → state → render`.

---

## 1. Session / user

```
localStorage["access_token"]  (api/client.ts:4)
  → app load: AuthContext.fetchMe()           context/AuthContext.tsx:26
  → GET /api/auth/me  → get_current_user → user_repo.find_by_id → ClickHouse users FINAL
  → UserResponse (id,email,username,is_active)
  → setUser()                                  AuthContext state
  → consumed by useAuth() in: route guards (App.tsx), DashboardLayout profile chip,
    LoginPage/RegisterPage redirect
```
On any 401 the axios response interceptor (`client.ts:54`) clears the token and redirects to `/login`.

---

## 2. Instagram connection & initial sync

```
User clicks "Connect Instagram"
  → ConnectInstagramPage → GET /instagram/connect
  → oauth_state.create_signed_oauth_state (signed JWT, 10-min TTL)   oauth_state.py:12
  → {oauth_url} → browser redirect → Instagram consent
  → redirect back → CallbackPage → GET /instagram/callback?code&state
  → service.exchange_code_for_token (POST api.instagram.com)         service.py:64
  → service.get_long_lived_token (graph.instagram.com)              service.py:100
  → service.fetch_profile + fetch_media (paginated, ≤200 pages)     service.py:272,292
  → crypto.encrypt_token(long_token, JWT_SECRET_KEY)                router.py:245
  → instagram_repo.upsert_profile → instagram_profiles
  → instagram_repo.bulk_insert_media → instagram_media (+ post_hashtags via hashtags.extract_hashtags)
  → background_tasks: _run_insights_sync                            router.py:255
  → CallbackResponse{success,profile} → CallbackPage → navigate /dashboard
```

---

## 3. Dashboard overview (the canonical read path)

```
User opens /dashboard
  → DashboardPage.tsx (useEffect)
  → usePeriodComparator() → compareTo  (PeriodComparatorContext derived state)
  → parallel fetches:
       api.get GET /instagram/profile
       api.get GET /instagram/insights/dashboard?days&top_n&compare_to
       api.get GET /instagram/insights/overview?days&compare_to
       safeGet GET /instagram/stories
       safeGet GET /instagram/insights/alerts
       api.get GET /instagram/insights/demographics (age + gender)
  ↓ backend (router.py:1538 dashboard)
     repository → models/queries.GET_DASHBOARD_SUMMARY (FINAL, PIVOTED_MEDIA_METRICS)
     reads account_insights + media_insights + instagram_media + instagram_profiles
     comparison math: stats.pct_delta / two_prop_z / is_significant (app/stats.py)
  → DashboardSummary {totals, top_posts[], prior?, comparisons{ComparisonValue}}
  → setState(summary/overview/...)             local useState
  → render: KPI cards, Sparkline + GlassTooltip, ComparisonPill (uses lib/stats.pctDelta),
    AlertsCard, PostInsightsDrawer (on click → GET /insights/media/{id}),
    demographics charts, stories strip
```

**Comparison flow:** `PeriodComparatorContext` (`compareMode` → derived `compareTo` string) is read by DashboardPage, AudienceDNAPage, ContentLabPage and appended as `compare_to`. The backend computes a `prior` block and per-metric `ComparisonValue{current,prior,delta_pct,significant}`; `ComparisonPill` renders the delta with a ✨ when `significant`.

---

## 4. Authed media thumbnails

```
Any media card needs an image
  → useAuthedImage(igMediaId)                   hooks/useAuthedImage.ts:6
  → api.get GET /instagram/media/{id}/image  {responseType:"blob"}   (Bearer header required)
  ↓ backend router.py:349
     GET_MEDIA_IMAGE_URL (user_id, ig_media_id) → stored thumbnail_url/media_url
     service.fetch_image(url) (browser UA, retry)
     on 403 (CDN expiry): decrypt token → fetch_fresh_media_urls → update_media_urls → retry
  → blob → URL.createObjectURL → <img src>
  → revoked on unmount (cancelled flag guards setState)
```

---

## 5. Insights sync job (async + polling)

```
POST /instagram/insights/sync {lookback_days, purge}
  → start_sync_job → instagram_sync_jobs (status='running')   sync_job_repo.py:54
  → background _run_insights_sync_tracked:
       fetch_account_insights (time_series + per-day total_value, Semaphore(3))  service.py:648
       fetch_demographics                                       service.py:858
       fetch_media_insights_batch (stale only, 24h)             service.py:487
       comment sync + story snapshot
       → bulk_upsert_* → account_insights / demographic_insights / media_insights
  → finish_sync_job → instagram_sync_jobs (status='completed'|'failed')  sync_job_repo.py:64
Frontend: waitForSync() polls GET /insights/sync/status every 1.5s until status≠running  client.ts:87
```

`instagram_sync_jobs` is a ReplacingMergeTree on `(user_id, job_id)`; `finish_sync_job` re-supplies `started_at`/`lookback_days` because RMT replaces the whole row.

---

## 6. Comment → sentiment → topic pipeline

```
Sync stores comments → instagram_comments
  → [scheduled hourly] sentiment_batch.main()                jobs/sentiment_batch.py
       find_comments_pending_sentiment (≤5000)
       per comment → Anthropic Claude Haiku (claude-haiku-4-5)  → sentiment/score/is_question/is_spam/is_collab
       → bulk_insert_sentiment → comment_sentiment
  → [scheduled weekly] topic_clustering.main()               jobs/topic_clustering.py
       TF-IDF (scikit-learn) → KMeans(k=min(12,max(4,n//60)))
       per cluster → Claude Haiku label
       → replace_topics_for_user → comment_topics
Read:
  GET /insights/sentiment → SentimentSummaryResponse  → AudienceDNAPage sentiment charts
  GET /insights/sentiment/topics → TopicsResponse      → topic affinity
  GET /comments/inbox → InboxComment[] (sentiment/is_question/is_collab/is_superfan) → InboxPage ⚠(unrouted)
```

---

## 7. AI Copilot (request + streaming digest)

```
Non-streaming (e.g. hooks):
  ViralHooksPanel → POST /ai/hooks {topic}
  → ai/quota.enforce (asyncio.Lock, monthly cap)            ai/quota.py:74
  → ai/client.synthesize(model=gpt-oss:120b, system, messages)  Ollama AsyncClient  ai/client.py
  → parse structured output → HooksResponse
  → ai/quota.record_call → ai_quota_usage
  → render via AIMarkdown; AIFeedback → POST /ai/feedback → ai_feedback

Streaming (weekly digest):
  WeeklyDigestCard → streamSSE("/ai/digest/stream?week_of=", onToken)   api/aiStream.ts
  → fetch() with Authorization: Bearer (EventSource can't set headers)
  → backend digest.py streams ai.chat(stream=True) token frames
  → onToken(text) appended → live narrative render
  → done frame → WeeklyDigestResponse persisted to ai_digests
```

Quota note: cached reads (`GET /ai/ideas` within 6h, `GET /ai/digest/weekly`) and `<3`-question mining don't charge. `digest_auto` (scheduled) is excluded from the user's monthly count.

---

## 8. Competitor tracking

```
Add: CompetitorsPage → POST /instagram/competitors {handle}
  → competitors.fetch_competitor_snapshot (Meta business_discovery)  competitors.py:36
  → persist competitor_handles + initial competitor_snapshots
[scheduled daily] competitor_sync._run                      jobs/competitor_sync.py
  → self-snapshot (handle="you") from instagram_profiles + last 25 media
  → per competitor: business_discovery → competitor_snapshots; record_failure / auto-disable after 3 fails
Read:
  GET /competitors/timeline (argMax per day) → LineChart
  GET /competitors/content-mix → BarChart (Reels/Carousel/Image)
```

---

## 9. YouTube data flow

```
Connect: YoutubeConnectPage → GET /youtube/connect → Google consent → /callback
  → exchange_code_for_tokens → encrypt refresh_token → youtube_tokens
  → fetch_channel (Data API) → youtube_channels; fetch_latest_videos → youtube_videos
  → bg _run_analytics_sync → fetch_analytics_overview (Analytics API) → youtube_daily_metrics

Retention: YoutubeRetentionPage → GET /youtube/insights/retention/{id}
  → Analytics API audienceWatchRatio/relativeRetentionPerformance → youtube_retention_curves
  → if ≥1000 views: bg retention_analyzer (Ollama) → youtube_retention_annotations
  → SmartRetentionChart (curve + benchmark + AI cliff markers)

Predictions: velocity samples (event-driven yt_velocity_tracker at +1/2/3/4h) → youtube_competitor_velocity
  → at +4h: predictive_model.train_model (sklearn LinearRegression, ≥5 samples) → youtube_model_state
  → predict 30d views + revenue (RPM) → youtube_predictions → YoutubePredictivePage chart

Competitors/webhook: WebSub push → /webhook/receive (Atom XML) → fan out:
  own channel → yt_preflight (LLM title CTR), schedule_golden_hour(+60m), schedule_velocity_checks
  competitor → record_title_if_changed, outlier detection (≥3× channel avg → LLM analysis)
```

---

## 10. Background jobs schedule

APScheduler `AsyncIOScheduler`, UTC, `coalesce=True, max_instances=1` (`scheduler.py:215`). Gated by `ENABLE_SCHEDULER` (default true).

| Job | Trigger (default) | Writes | External | Gate |
|---|---|---|---|---|
| `account_sync` | daily 02:00 | profiles, media, insights | Meta Graph | — |
| `competitor_sync` | daily 03:00 | competitor_snapshots | Meta Graph | — |
| `sentiment_batch` | every 60 min | comment_sentiment | **Anthropic** | needs `ANTHROPIC_API_KEY` |
| `topic_clustering` | weekly Mon 04:00 | comment_topics | **Anthropic** | — |
| `branded_hashtag_sync` | weekly Tue 04:15 | branded mentions | none (SQL) | — |
| `story_snapshot` | every 4h (+~120s after boot) | instagram_stories, media_insights | Meta Graph | — |
| `dm_funnel_runner` | every 15 min | dm_funnel_sends, comments | Meta Graph (DM/reply) | — |
| `weekly_digest` | weekly Mon 08:00 | ai_digests | **Ollama** | skipped w/o `OLLAMA_API_KEY` |
| `yt_outlier_detection` (`yt_competitor_poll`) | daily 02:00 (hardcoded) | competitor videos, outliers | YouTube + LLM | skipped if `WEBHOOK_BASE_URL` set |
| `yt_archive_miner` | weekly Sun 03:30 | archive suggestions | LLM + Wikimedia + autocomplete | skipped w/o `OLLAMA_API_KEY` |

Event-driven (not in the recurring table): `yt_golden_hour` (+60 min one-shot), `yt_velocity_tracker` (+1/2/3/4h), `yt_preflight` (on publish). One-shot factories: `schedule_golden_hour`, `schedule_velocity_checks` (`scheduler.py:147,167`).

> ⚠ `dm_funnel_runner` autonomously messages real followers via Meta's private-reply API every 15 min — see `SECURITY_AUDIT.md`. `sentiment_batch` makes one LLM call per comment (≤5000/run, hourly) — see `PERFORMANCE_AUDIT.md`.

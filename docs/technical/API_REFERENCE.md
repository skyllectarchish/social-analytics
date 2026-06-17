# API_REFERENCE.md

> Every backend endpoint, traced from the React caller through the service layer to the data store. All paths are absolute (include the router prefix). All routes require a JWT bearer token via `Depends(get_current_user)` **unless marked Public**.

Routers (`backend/app/main.py:59-68`): `auth` (`/api/auth`), `instagram` (`/api/instagram`), `youtube` (`/api/youtube`), `youtube_webhook` (`/api/youtube/webhook`), `ai` (paths inline `/api/...`), `admin` (`/api/admin`, conditionally mounted).

---

## 1. Health & Auth

| Method | Path | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/health` | Public | — | `{status, database}` | `main.py:72` |
| POST | `/api/auth/register` | Public | `{email, username, password}` | `TokenResponse` | 201; 409 if email exists |
| POST | `/api/auth/login` | Public | `{email, password}` | `TokenResponse` | 401 bad creds / 403 disabled |
| GET | `/api/auth/me` | JWT | — | `UserResponse` | session restore |

`TokenResponse = {access_token, token_type:"bearer", user:{id,email,username,is_active}}`. No `/refresh` or `/logout` exist.

---

## 2. Instagram (`/api/instagram`) — 59 routes

### OAuth & connection
| Method | Path | Request | Response | Purpose |
|---|---|---|---|---|
| GET | `/connect` | — | `ConnectResponse{oauth_url,state}` | mint OAuth state + URL |
| GET | `/callback` | `?code&state` | `CallbackResponse{success,profile}` | exchange code, sync, backfill |
| GET | `/profile` | `?live=bool` | `InstagramProfile` | stored profile (or 1 live fetch) |
| GET | `/media` | `?page&page_size&live` | `MediaListResponse` | paginated media |
| GET | `/media/{ig_media_id}/image` | — | raw image bytes | same-origin proxy + CDN-expiry refresh |
| POST | `/purge` | `?synth_only` | `PurgeResponse` | wipe stored data |
| POST | `/refresh` | — | `CallbackResponse` | re-fetch with stored token |
| POST | `/disconnect` | — | `{success,ig_user_id}` | delete profile+token |

### Account insights & dashboard
| Method | Path | Key params | Response |
|---|---|---|---|
| GET | `/insights/overview` | `days, compare_to` | `OverviewResponse` (5 metric series + recursive `prior`) |
| GET | `/insights/dashboard` | `days, top_n, compare_to` | `DashboardSummary` (hero cards + top posts) |
| GET | `/insights/alerts` | `days(3–30)` | `AlertsResponse` (anomaly detection) |
| GET | `/insights/demographics` | `metric, breakdown` | `DemographicResponse` |
| GET | `/insights/sync` | _(POST)_ `lookback_days, purge` | `SyncResponse{job_id}` |
| POST | `/insights/sync` | `lookback_days, purge` | `SyncResponse` | kick off async sync |
| GET | `/insights/sync/status` | — | `SyncStatusResponse` (idle/running/completed/failed) |
| GET | `/insights/format-fatigue` | `weeks(4–52)` | `FormatFatigueResponse` (deterministic) |

### Content Lab analytics
| Method | Path | Key params |
|---|---|---|
| GET | `/insights/format-breakdown` | `days(1–365), compare_to` |
| GET | `/insights/format-breakdown/posts` | `format, days, limit` |
| GET | `/insights/best-time` | `days, min_sample, compare_to` |
| GET | `/insights/best-time/posts` | `day(1–7), hour(0–23), days` |
| GET | `/insights/algorithm-metrics` | `days, limit, compare_to` |
| GET | `/insights/hashtags` | `days, limit, min_uses, compare_to` |
| GET | `/insights/hashtags/trend` | `tag, days, compare_to` |
| GET | `/insights/hashtags/combos` | `days, min_uses, compare_to` |

### Reels & follower quality
| Method | Path | Key params |
|---|---|---|
| GET | `/insights/reels-retention` | `days, limit, compare_to` |
| GET | `/insights/reels-retention/trend` | `days, compare_to` |
| GET | `/insights/follower-quality` | `breakdown` |
| GET | `/insights/follower-quality/summary` | `breakdown` |
| GET | `/insights/follower-quality/spikes` | `days, threshold` |
| GET | `/insights/growth-drivers` | `days, limit, compare_to` |
| GET | `/insights/growth-correlation` | `days, compare_to` |

### Per-media
| Method | Path | Response |
|---|---|---|
| GET | `/insights/media/{media_id}` | `MediaInsightsResponse` |
| GET | `/insights/media/{media_id}/conversion` | `PostConversionResponse` (404 if ineligible) |

### Sentiment / comments / inbox
| Method | Path | Key params / body |
|---|---|---|
| GET | `/insights/sentiment` | `days, compare_to` |
| GET | `/insights/sentiment/topics` | `days` |
| GET | `/insights/sentiment/questions` | `days, limit` |
| GET | `/insights/sentiment/media/{media_id}` | — |
| GET | `/insights/sentiment/diagnose` | — (explains empty Audience Voice; returns 200 even when not connected) |
| POST | `/insights/sentiment/seed-demo` | — (synthetic demo data) |
| GET | `/comments/inbox` | `sentiment, questions_only, unanswered_only, collab_only, limit, offset` |
| GET | `/comments/superfans` | `days, limit` |
| POST | `/comments/{comment_id}/reply` | `{message}` (1–2200) → posts reply via Graph |

### Stories, trending audio, archive
| Method | Path | Notes |
|---|---|---|
| GET | `/stories` | live active stories + insights |
| GET | `/trending-audio` | `?week, limit` — curated editorial (not live) |
| POST | `/import/archive` | multipart `files[]` — IG data export |
| GET | `/import/summary` | counts/date ranges from import |

### Competitors
| Method | Path | Body / params |
|---|---|---|
| GET | `/competitors/lookup` | `?handle` (live business-discovery preview) |
| GET | `/competitors` | list tracked + self snapshot |
| POST | `/competitors` | `{handle}` (max 30, regex) |
| DELETE | `/competitors/{handle}` | 204 soft-delete |
| GET | `/competitors/timeline` | `?days` |
| GET | `/competitors/content-mix` | `?days` |

### Branded hashtags & DM funnels
| Method | Path | Body / params |
|---|---|---|
| GET | `/branded-hashtags` | `?days` |
| POST | `/branded-hashtags` | `{hashtag}` (max 3 tracked) |
| DELETE | `/branded-hashtags/{hashtag}` | 204 |
| GET | `/branded-hashtags/{hashtag}/mentions` | `?days&limit` |
| GET | `/dm-funnels` | list funnels + send stats |
| POST | `/dm-funnels` | `{keyword, dm_message, public_reply?, ig_media_id?}` |
| DELETE | `/dm-funnels/{funnel_id}` | 204 |
| GET | `/dm-funnels/sends` | `?limit` (activity feed) |

---

## 3. AI Copilot (`/api/ai`, `/api/telemetry`) — 13 routes

| Method | Path | Request | Response | Quota |
|---|---|---|---|---|
| GET | `/api/ai/quota` | — | `QuotaResponse{used,limit,resets_at}` | no charge |
| POST | `/api/ai/feedback` | `{feature, ref_id, rating}` | 204 | no charge |
| POST | `/api/telemetry` | `{events[]}` | 204 | 413 if >200 events |
| GET | `/api/ai/digest/weekly` | `?week_of` | `WeeklyDigestResponse` | read cache, no charge |
| POST | `/api/ai/digest/regenerate` | `{week_of?}` | `WeeklyDigestResponse` | 1 call |
| GET | `/api/ai/digest/stream` | `?week_of` | **SSE** `text/event-stream` | 1 call |
| GET | `/api/ai/ideas` | `?days&limit&refresh` | `ContentIdeasResponse` | 6h cache; hit = no charge |
| POST | `/api/ai/diagnose-post` | `{ig_media_id}` | `DiagnosticResponse` | 5-min cache; ≥24h eligibility |
| POST | `/api/ai/reel-script` | `{title, summary}` | `ReelScriptResponse` | 1 call |
| POST | `/api/ai/hooks` | `{topic}` | `HooksResponse` | 1 call |
| POST | `/api/ai/repurpose` | `{content}` | `RepurposeResponse` (4 assets) | 1 call |
| POST | `/api/ai/question-mining` | `?days&demo` | `QuestionMiningResponse` | skipped if <3 questions |
| POST | `/api/ai/comment-reply` | `{ig_comment_id}` | `CommentReplySuggestResponse` (3 tones) | 1 call; 404 if not synced |
| POST | `/api/ai/caption/suggest` | `{draft, format, topic_hint?}` | `CaptionSuggestResponse` | 1 call |

**Quota** (`ai/quota.py`): monthly cap `AI_MONTHLY_CALL_LIMIT` (default 100), counted from `ai_quota_usage` excluding `feature='digest_auto'`. Per-user `asyncio.Lock` serializes check+charge (⚠ not cross-process safe). The Copilot LLM is **Ollama `gpt-oss:120b`** (`ai/client.py:57`).

### Admin (mounted only if `ADMIN_API_KEY` set)
| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/admin/ai-cost` | `X-Admin-Key` | spend by (day, feature, model) — ⚠ totals are $0 (empty pricing table) |

---

## 4. YouTube (`/api/youtube`) — 22 routes + 2 webhook

| Method | Path | Request | Purpose |
|---|---|---|---|
| GET | `/connect` | — | mint Google OAuth URL |
| GET | `/callback` | `?code&state` | exchange code, store token/channel/videos |
| GET | `/channel` | — | stored channel (404 if not connected) |
| GET | `/videos` | `?page&page_size` | paginated videos |
| POST | `/refresh` | — | re-fetch with stored refresh token |
| POST | `/disconnect` | — | delete token row |
| POST | `/insights/sync` | `?lookback_days` | queue analytics sync |
| GET | `/insights/overview` | `?days` | daily views/watch-min/subs |
| GET | `/insights/retention/{video_id}` | — | retention curve + queue AI annotation (≥1000 views) |
| GET | `/competitors` | — | list tracked |
| POST | `/competitors` | `{handle}` | add (201); 429 at limit; subscribes WebSub |
| DELETE | `/competitors/{competitor_channel_id}` | — | 204 + unsubscribe |
| POST | `/competitors/sync` | — | 202 queue fetch |
| GET | `/insights/outliers` | — | competitor outlier videos |
| GET | `/insights/recent-videos` | — | recent competitor videos |
| GET | `/insights/title-history/{video_id}` | — | title-change history |
| GET | `/insights/velocity/{video_id}` | — | velocity samples |
| GET | `/insights/predictions/{video_id}` | — | 30-day view/revenue prediction |
| GET | `/insights/archive` | — | archive-revival suggestions |
| POST | `/insights/archive/refresh` | — | 202 queue miner (429 if <24h) |
| GET | `/insights/alerts` | — | video alerts |
| GET | `/insights/cross-platform` | `?days` | IG-reel ↔ subs correlation |

### Webhook (Public — PubSubHubbub)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/youtube/webhook/verify` | echoes `hub.challenge` |
| POST | `/api/youtube/webhook/receive` | Atom XML → bg jobs. ⚠ **No HMAC verification** (see `SECURITY_AUDIT.md`) |

---

## 5. API → Frontend mapping (Phase 2 table)

Service layer for the frontend is the single axios instance in `api/client.ts`; calls use `api.get/post/put/delete`, `safeGet` (null-on-error), or `streamSSE` (`api/aiStream.ts`). State is local page `useState` (no global store except `AuthContext`/`PeriodComparatorContext`).

| API | Called from | Service helper | Response used by | State updated |
|---|---|---|---|---|
| `POST /auth/login` | LoginPage | `useAuth().login` → api.post | AuthContext | `user` (context) + localStorage |
| `POST /auth/register` | RegisterPage | `useAuth().register` | AuthContext | `user` + localStorage |
| `GET /auth/me` | App load | AuthContext.fetchMe → api.get | route guards | `user`, `loading` |
| `GET /instagram/connect` | ConnectInstagramPage | api.get | redirect to IG | local `busy` |
| `GET /instagram/callback` | CallbackPage | api.get | status UI | local `status` |
| `GET /instagram/profile` | DashboardPage, MediaKitPage, DMAutomationPage, DashboardLayout | api.get / safeGet | profile chip, hero | local `profile`, `connected` |
| `GET /instagram/insights/dashboard` | DashboardPage, MediaKitPage | api.get | KPI cards, top posts | local `summary` |
| `GET /instagram/insights/overview` | DashboardPage | api.get | charts | local `overview` |
| `GET /instagram/stories` | DashboardPage | safeGet | stories strip | local `stories` |
| `GET /instagram/insights/alerts` | DashboardPage | safeGet | `AlertsCard` | local `alerts` |
| `GET /instagram/insights/demographics` | DashboardPage(×2), MediaKitPage(×3) | api.get/safeGet | demo charts | local `ageDemo`/`genderDemo`/… |
| `POST /instagram/refresh` | DashboardPage, PostsPage, MediaKitPage | api.post | triggers reload | local `syncing` |
| `POST /instagram/insights/sync` | DashboardPage, MediaKitPage, (Inbox, YT pages) | api.post | sync flow | local `syncing` |
| `GET /instagram/insights/sync/status` | via `waitForSync()` | safeGet (poll 1.5s) | sync gate | — |
| `GET /instagram/media` | PostsPage, DMAutomationPage | api.get/safeGet | post grid | local `items` |
| `GET /instagram/import/summary` + `POST /import/archive` | ImportPage | safeGet/api.post | import UI | local `summary`,`result` |
| `GET /instagram/insights/best-time`/`format-breakdown`/`algorithm-metrics`/`hashtags`/`hashtags/combos`/`format-breakdown/posts`/`best-time/posts`/`hashtags/trend` | ContentLabPage | safeGet | charts + drilldowns | local per-section |
| `GET /instagram/insights/reels-retention`(+`/trend`) | ReelsStudioPage | safeGet | reel table/charts | local `reels`,`trend` |
| `GET /instagram/insights/sentiment`,`/topics`,`/questions`,`/diagnose`,`follower-quality`(+`/summary`,`/spikes`),`growth-drivers`,`growth-correlation` | AudienceDNAPage | safeGet | audience charts | local per-section |
| `POST /instagram/insights/sentiment/seed-demo` | AudienceDNAPage | api.post | demo seed | `reloadKey` |
| `GET /instagram/competitors`(+`/timeline`,`/content-mix`,`/lookup`); `POST`/`DELETE /competitors` | CompetitorsPage | safeGet/api.* | charts + list | local `rows`,`growth`,`mix` |
| `GET/POST/DELETE /instagram/branded-hashtags[...]` | `BrandedHashtags` (in ContentLabPage) | safeGet/api.* | tag list/mentions | local `tags`,`mentions` |
| `GET /instagram/dm-funnels`(+`/sends`); `POST`/`DELETE` | DMAutomationPage | api.* | funnel list | local `automations`,`sends` |
| `GET /instagram/insights/media/{id}` | `PostInsightsDrawer` | safeGet | drawer metrics | local `insights` |
| `GET /instagram/insights/format-fatigue` | `FormatFatigueCard` | safeGet | fatigue card | local |
| `GET /instagram/trending-audio` | `TrendingAudioPanel` | safeGet | audio list | local (mock fallback) |
| `GET /ai/quota` | CopilotPage, DashboardLayout, YoutubeDashboardLayout | safeGet | quota chip | local `quota` |
| `POST /ai/feedback` | `AIFeedback` | api.post | thumbs | optimistic local |
| `GET /ai/ideas` | `ContentIdeasPanel` | safeGet | ideas list | local |
| `POST /ai/hooks`/`reel-script`/`repurpose`/`caption/suggest`/`question-mining`/`diagnose-post`/`comment-reply` | copilot components | api.post | AI output | local |
| `GET /ai/digest/weekly` + SSE `/ai/digest/stream` | `WeeklyDigestCard` | safeGet + `streamSSE` | digest stream | local + token accumulation |
| `POST /ai/comment-reply`, `POST /comments/{id}/reply` | InboxPage ⚠(unrouted) | api.post | reply composer | local |
| `GET /youtube/connect`/`callback` | YoutubeConnect/CallbackPage | api.get | redirect/status | local |
| `GET /youtube/channel` | YoutubeDashboardLayout | api.get | channel chip | local `connected` |
| `GET /youtube/insights/overview` + `/videos` | YoutubeDashboardPage | safeGet | charts/list | local |
| `GET /youtube/insights/retention/{id}` | YoutubeRetentionPage | api.get | `SmartRetentionChart` | local `retention` |
| `GET /youtube/competitors`,`/insights/outliers`,`/recent-videos`,`/title-history/{id}`; `POST`/`DELETE` | YoutubeCompetitorsPage | api.* | competitor UI | local |
| `GET /youtube/insights/velocity/{id}` + `/predictions/{id}` | YoutubePredictivePage | api.get | prediction chart | local |
| `GET /youtube/insights/archive` + `POST /archive/refresh` | YoutubeArchivePage | api.* (5s poll) | suggestions | local `status` |
| `GET /youtube/insights/cross-platform` | YoutubeFunnelPage | api.get | correlation chart | local `data` |
| `GET /instagram/media/{id}/image` | `useAuthedImage` (everywhere) | api.get(blob) | `<img src>` | local object URL |

> **InboxPage** is fully implemented (6 endpoints incl. `POST /ai/comment-reply`) but **not routed in `App.tsx`** — the comment-inbox feature is currently unreachable from the UI.

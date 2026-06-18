# Instagram Business API — Complete Reference

_Every Instagram (Meta) Graph API endpoint this project calls, in one place, with what each is used for._

> **Last updated:** 2026-06-18 · **Scope:** the `instagram_*` modules in `backend/app/instagram/`.
> This documents the **external Meta API** we consume — not our own `/api/instagram/*` REST routes (see [`API_REFERENCE.md`](API_REFERENCE.md) for those).

---

## 1. Overview

This app uses the **Instagram Login API** (a.k.a. "Instagram API with Instagram Login") — the **direct** Instagram Graph integration that does **not** require a Facebook account, Facebook Page, or the Page→IG-account walk. The single token-exchange response carries both the access token **and** the IG user ID.

- **Graph base URL:** `https://graph.instagram.com` (unversioned) — constant `GRAPH_BASE_URL` in `app/constants.py`.
- **OAuth dialog host:** `https://www.instagram.com/oauth/authorize`
- **Token exchange host:** `https://api.instagram.com/oauth/access_token`
- **Account requirement:** the connected IG account **must be Business or Creator**. There is no fallback for personal accounts — Meta does not expose insights/media for them.
- **HTTP client:** `httpx.AsyncClient` with a 30s timeout (`HTTP_TIMEOUT_SECONDS`). Reads go through `_retry_get_json` (exponential backoff on transient/`is_transient` errors + `Retry-After`).

### OAuth scopes requested (`REQUIRED_INSTAGRAM_SCOPES`)

| Scope | Unlocks |
|---|---|
| `instagram_business_basic` | Profile + media reads |
| `instagram_business_manage_insights` | Account & per-media insights, demographics |
| `instagram_business_manage_comments` | Read comments, post public replies |
| `instagram_business_manage_messages` | Send private (DM) replies to commenters |

> ⚠️ **App Review / Advanced Access:** comment and message scopes return **zero real data** (and DM sends fail) until the Meta app is granted Advanced Access via App Review. Until then the inbox is empty of real comments and demo data is used.

---

## 2. Authentication & token lifecycle

The full OAuth flow lives in `app/instagram/service.py` and is mounted under `/api/instagram` (`/connect`, `/callback`, `/refresh`).

| # | Method & Endpoint | Code | Used for |
|---|---|---|---|
| 1 | `GET https://www.instagram.com/oauth/authorize` | `get_oauth_url()` | Build the consent dialog URL. Params: `client_id` (`META_APP_ID`), `redirect_uri` (`META_REDIRECT_URI`), `scope` (the 4 scopes, comma-joined), `response_type=code`, `state` (signed JWT, ~10 min TTL, CSRF binding to the user). |
| 2 | `POST https://api.instagram.com/oauth/access_token` | `exchange_code_for_token()` | Exchange the `?code` from the redirect for a **short-lived token + IG user ID** in one response (no `/me/accounts` Page walk). |
| 3 | `GET https://graph.instagram.com/access_token` | `get_long_lived_token()` | Upgrade short-lived → **long-lived token (~60 days)**. `grant_type=ig_exchange_token`, `client_secret=META_APP_SECRET`. |
| 4 | `GET https://graph.instagram.com/refresh_access_token` | `refresh_long_lived_token()` | Renew an unexpired long-lived token for another ~60 days. `grant_type=ig_refresh_token`. Driven by the daily `account_sync` job. |

**Flow:** `/connect` → mint state → redirect to (1) → Instagram redirects back to `META_REDIRECT_URI` with `?code&state` → `/callback` verifies state, runs (2) then (3), then fetches profile + media + insights and stores in ClickHouse. `/refresh` re-runs the data fetch on the stored token (no new OAuth).

---

## 3. Profile & media

| # | Method & Endpoint | Code | Used for |
|---|---|---|---|
| 5 | `GET /{ig-user-id}` | `fetch_profile()` | The connected account's profile. `fields` = `INSTAGRAM_PROFILE_FIELDS` (`username, name, biography, profile_picture_url, followers_count, follows_count, media_count`). Powers the Overview header + profile chip. |
| 6 | `GET /{ig-user-id}/media` | `fetch_media()`, `fetch_fresh_media_urls()` | Paginated list of the account's posts/reels. `fields` = `INSTAGRAM_MEDIA_FIELDS` (`id, media_type, media_product_type, media_url, thumbnail_url, permalink, caption, timestamp, like_count, comments_count`). Paginated via the `after` cursor to stay on `graph.instagram.com`. `fetch_fresh_media_urls` re-resolves expiring CDN URLs by id. Powers Posts, Content Lab, Reels Studio. |
| 7 | `GET /{ig-user-id}/stories` | `fetch_active_stories()` | Currently-active (24h) stories. `fields` = `STORY_FIELDS` (`id, media_type, media_url, thumbnail_url, permalink, timestamp`). Feeds story-snapshot retention tracking. |

**Media image proxy** — `fetch_image()` does a plain authenticated `GET` on a media's `media_url`/`thumbnail_url` (the Instagram CDN, `follow_redirects=True`). Not a Graph endpoint; it backs the `/instagram/media/{id}/image` proxy so the browser can load thumbnails without leaking tokens.

---

## 4. Insights

All insights are read from one of two endpoints, varying by `metric`, `metric_type`, `period`, and `breakdown`.

### 4a. Account-level — `GET /{ig-user-id}/insights`

`fetch_account_insights()` and `fetch_demographics()`. Meta caps `since`/`until` at ~30 days per request, so backfill is chunked (`INSIGHTS_API_WINDOW_DAYS=30`, initial backfill `INSIGHTS_INITIAL_FETCH_DAYS=90`).

| Metric(s) | `metric_type` | Purpose |
|---|---|---|
| `reach` (`ACCOUNT_TIME_SERIES_METRICS`) | `time_series` | Daily reach trend |
| `views` (`ACCOUNT_TOTAL_VALUE_METRICS`) | `total_value` | Total views (cannot combine with `time_series`) |
| `follows_and_unfollows`, online-followers flat metrics | `total_value` + breakdowns | Net follower growth/churn |
| `follower_demographics`, `engaged_audience_demographics` (`ACCOUNT_DEMOGRAPHIC_METRICS`) | `total_value` | Audience DNA (age/gender/country/city). Returns Meta error `3006` / "not enough users" for small audiences — handled gracefully. |

### 4b. Per-media — `GET /{media-id}/insights`

`fetch_media_insights()`, `fetch_media_insights_batch()` (concurrent, with `Retry-After` handling), `_fetch_reach_follower_breakdown()` (follower vs non-follower reach split). The metric set depends on media type:

| Media type | Metric constant | Metrics |
|---|---|---|
| Feed post | `MEDIA_FEED_METRICS` | `likes, comments, saved, shares, reach, views, total_interactions, profile_visits` |
| Reel | `MEDIA_REELS_METRICS` | feed set + `ig_reels_avg_watch_time, ig_reels_video_view_total_time, reels_skip_rate` |
| Story | `MEDIA_STORY_METRICS` | `reach, views, shares, replies, navigation, total_interactions` |

> Note: `reposts` was removed — Meta's Media Insights API now rejects it with HTTP 400. Posts predating the account's Business conversion fail with subcode `2108006` (known follow-up: needs a permanent-fail marker so they stop being retried).

---

## 5. Comments & messaging

Require comment/message scopes + Advanced Access (see §1).

| # | Method & Endpoint | Code | Used for |
|---|---|---|---|
| 8 | `GET /{media-id}/comments` | `fetch_comments_for_media()` | Comments + nested `replies` for a post (paginated). Replies are flattened with a `_parent_id`. Feeds sentiment/topic batch jobs, the Inbox, superfan & collab detection. |
| 9 | `POST /{comment-id}/replies` | `post_comment_reply()` | Post a **public** reply under a comment. Returns the new comment id. Backs the Inbox "reply" action. |
| 10 | `POST /me/messages` | `send_private_reply()` | Send a **private DM** to a commenter (comment-to-DM funnels / "DM Automation"). Body targets the comment via recipient `comment_id`; returns `message_id`. _Untested against real comments — needs `manage_messages` Advanced Access + a live trigger._ |

---

## 6. Competitors (business discovery)

| # | Method & Endpoint | Code | Used for |
|---|---|---|---|
| 11 | `GET /{ig-user-id}?fields=business_discovery.username(HANDLE){...}` | `fetch_competitor_snapshot()` | Public profile + last 25 posts of **any** public Business/Creator account, by handle. `BUSINESS_DISCOVERY_FIELDS` = `username, name, profile_picture_url, followers_count, media_count, media.limit(25){id, media_type, media_product_type, caption, timestamp, like_count, comments_count, permalink, thumbnail_url, media_url}`. Powers the Competitors radar. |

**Routing nuance:** `business_discovery` is technically a full-Graph feature. If `META_SYSTEM_TOKEN` + `META_SYSTEM_IG_USER_ID` are configured, the query is routed through `https://graph.facebook.com/v18.0/{system-ig-user-id}` with the system token; otherwise it falls back to `graph.instagram.com/{my-ig-user-id}` with the user's own token. The handle is hard-validated against `^[A-Za-z0-9._]{1,30}$` before interpolation into Meta's Graph DSL (defense-in-depth against query injection).

---

## 7. Branded hashtag tracking

`app/instagram/branded_hashtags.py` — two-step Hashtag Search flow.

| # | Method & Endpoint | Code | Used for |
|---|---|---|---|
| 12 | `GET /ig_hashtag_search` | `branded_hashtags` | Resolve a hashtag string → hashtag id. Params: `user_id`, `q=<hashtag>`. |
| 13 | `GET /{ig-hashtag-id}/recent_media` | `branded_hashtags` | Recent public media tagged with that hashtag (default `limit=25`), scoped to the requesting `user_id`. Powers branded-hashtag mention tracking. |

---

## 8. Endpoint quick-index

| Meta endpoint | Method | Module function | Feature |
|---|---|---|---|
| `/oauth/authorize` | GET | `get_oauth_url` | Connect flow |
| `/oauth/access_token` (api.instagram.com) | POST | `exchange_code_for_token` | Connect flow |
| `/access_token` | GET | `get_long_lived_token` | Token upgrade |
| `/refresh_access_token` | GET | `refresh_long_lived_token` | Token renewal |
| `/{ig-user-id}` | GET | `fetch_profile` | Profile |
| `/{ig-user-id}/media` | GET | `fetch_media`, `fetch_fresh_media_urls` | Posts / Reels |
| `/{ig-user-id}/stories` | GET | `fetch_active_stories` | Story retention |
| `/{ig-user-id}/insights` | GET | `fetch_account_insights`, `fetch_demographics` | Reach, growth, Audience DNA |
| `/{media-id}/insights` | GET | `fetch_media_insights`, `fetch_media_insights_batch`, `_fetch_reach_follower_breakdown` | Per-post/reel/story metrics |
| `/{media-id}/comments` | GET | `fetch_comments_for_media` | Comments, sentiment, Inbox |
| `/{comment-id}/replies` | POST | `post_comment_reply` | Public reply |
| `/me/messages` | POST | `send_private_reply` | DM automation |
| `/{ig-user-id}?fields=business_discovery…` | GET | `fetch_competitor_snapshot` | Competitors |
| `/ig_hashtag_search` | GET | `branded_hashtags` | Hashtag → id |
| `/{ig-hashtag-id}/recent_media` | GET | `branded_hashtags` | Hashtag mentions |

---

## 9. Gotchas & constraints

- **Unversioned base.** IG-Login Graph calls go to `graph.instagram.com` (no `/vXX.X/`). The **only** versioned call is competitor `business_discovery` when routed via `graph.facebook.com/v18.0`.
- **30-day insight window.** Account insights are chunked at 30 days/request; ClickHouse retains up to 365 days (`INSIGHTS_MAX_LOOKBACK_DAYS`).
- **CDN URL expiry.** `media_url`/`thumbnail_url` expire — re-resolve via `fetch_fresh_media_urls` rather than caching them long-term.
- **Advanced Access gating.** Comments/messages need App Review; demographics need a minimum audience size (error `3006`).
- **Transient errors.** Reads retry with backoff on `is_transient`/rate-limit responses (`_retry_get_json`, `Retry-After` honored).

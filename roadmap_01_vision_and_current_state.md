# InfluenceIQ — Product Roadmap (Part 1 of 4)
# Vision, Current State & Feature Inventory

---

## 🎯 Product Vision

**InfluenceIQ** is an analytics-first command center for Instagram and YouTube content creators. Unlike surface-level schedulers (Buffer, Later), InfluenceIQ focuses on **deep performance intelligence** — answering not just *what* happened, but **why** content performs, **when** to post next, and **what** to create next.

The goal: become the **single tool a creator opens every morning** to understand their growth, reply to their audience, spy on competitors, and get AI-powered recommendations — all without switching between 5 different apps.

---

## ✅ Current Feature Inventory (What's Already Built)

### Tier 0 — Foundation (Complete ✅)
| Feature | Status | Description |
|---------|--------|-------------|
| User Auth (JWT) | ✅ Done | Register / Login with email+password, JWT bearer tokens |
| Instagram OAuth | ✅ Done | Instagram Login API (no Facebook Page required), short→long-lived token upgrade |
| YouTube OAuth | ✅ Done | Google OAuth2 for YouTube Data API + Analytics API |
| ClickHouse Storage | ✅ Done | 42 migration files, ReplacingMergeTree tables, encrypted token storage |
| Vite + React 19 Frontend | ✅ Done | TypeScript, Tailwind v4, Framer Motion, Recharts |

---

### Tier 1 — Core Analytics (Complete ✅)

#### Instagram
| Feature | Page | Description | Creator Benefit |
|---------|------|-------------|-----------------|
| Profile Dashboard | `/dashboard` | Followers, following, media count, bio, profile picture | At-a-glance account health |
| Media Gallery | `/dashboard/posts` | Paginated media list with proxy thumbnails | Browse all content in one place |
| Insights Overview | `/dashboard` | Views, reach, follows, interactions, engaged accounts — with time-series charts | Track growth trends over 7/14/28/90 days |
| Period Comparison | `/dashboard` | Compare current period vs previous period (WoW, MoM, YTD, MTD) | Spot momentum shifts instantly |
| Dashboard Summary | `/dashboard` | Aggregated KPIs: total views, reach, interactions, engaged accounts | One-number health check |
| Follower Growth | `/dashboard` | Net follower change over time window | Know if you're growing or shrinking |
| Top Performing Posts | `/dashboard` | Ranked by interactions within date window | Double down on what works |

#### YouTube
| Feature | Page | Description | Creator Benefit |
|---------|------|-------------|-----------------|
| Channel Dashboard | `/youtube` | Subscriber count, total views, video count | YouTube account overview |
| Video Analytics | `/youtube` | Per-video metrics (views, likes, comments) | Identify best-performing videos |

---

### Tier 2 — Deep Intelligence (Complete ✅)

#### Instagram Content Lab (`/dashboard/content`)
| Feature | Description | Creator Benefit |
|---------|-------------|-----------------|
| Format Breakdown | Performance by FEED / REELS / CAROUSEL — reach, views, saves, shares, engagement rate | Know which format to invest time in |
| Best Time to Post | Heatmap of day-of-week × hour-of-day, split by format | Post when your audience is actually online |
| Algorithm Score | Weighted metric: shares×0.4 + saves×0.35 + likes×0.15 + comments×0.1 | Understand what the IG algorithm rewards |
| Format Fatigue Detection | Consecutive-week engagement trend per format with decline/improve/steady verdicts | Get warned before your reels stop working |
| Hashtag Analytics | Per-hashtag performance breakdown, top combos, trend over time | Optimize hashtag strategy with data |
| Branded Hashtag Tracking | Weekly sync of mentions for your branded hashtags | Monitor campaign/community hashtag reach |

#### Instagram Reels Studio (`/dashboard/reels`)
| Feature | Description | Creator Benefit |
|---------|-------------|-----------------|
| Retention Metrics | Hook strength %, avg watch time, skip rate, replay rate | Understand exactly where viewers drop off |
| Retention Trends | Weekly trend of hook strength + watch time averages | Track if your hooks are improving |

#### Instagram Audience DNA (`/dashboard/audience`)
| Feature | Description | Creator Benefit |
|---------|-------------|-----------------|
| Demographic Breakdown | Age, gender, city, country distributions (followers vs engaged) | Know WHO your audience actually is |
| Follower Quality Score | Engagement rate per cohort, quality tiers (HIGH/MEDIUM/LOW/DORMANT) | Identify ghost followers vs real fans |
| Follower Spikes Detection | Anomalous follow/unfollow events with suspicion scoring | Detect bot attacks or viral moments |
| Superfans | Top repeat commenters across multiple posts | Find your most loyal community members |
| Growth Correlation | Content activity vs follower growth correlation | See what content type drives follows |

#### Instagram Competitors (`/dashboard/competitors`)
| Feature | Description | Creator Benefit |
|---------|-------------|-----------------|
| Competitor Tracking | Add up to 5 (standard) or 25 (premium) competitor handles | Benchmark against your niche |
| Daily Snapshots | Automated daily follower/media count captures | Track competitor growth over time |
| Content Mix Comparison | Your posting distribution vs competitors | Spot format gaps in your strategy |
| Timeline Charts | Multi-series follower growth comparison over time | Visualize who's growing fastest |

#### Instagram Comment Intelligence
| Feature | Description | Creator Benefit |
|---------|-------------|-----------------|
| Comment Inbox | Unified inbox with sentiment, question, and collab filters | Never miss an important comment |
| Sentiment Analysis | Claude Haiku-powered positive/negative/neutral scoring | Understand audience mood at scale |
| Question Detection | Auto-flag comments that ask questions | Content ideas straight from your audience |
| Collab Detection | Brand partnership inquiry identification | Never miss a sponsorship DM |
| Topic Clustering | TF-IDF + KMeans weekly clustering of comment themes | Discover what topics your audience cares about |
| Comment Reply | Direct reply through the Graph API from within the dashboard | Reply without opening Instagram |

#### Background Jobs (Automated)
| Job | Cadence | Description |
|-----|---------|-------------|
| Account Sync | Daily 2:00 UTC | Refresh profile, media, insights + token renewal |
| Competitor Sync | Daily 3:00 UTC | Snapshot all tracked competitor profiles |
| Sentiment Batch | Every 60 min | Score unscored comments via Claude Haiku |
| Topic Clustering | Weekly (Monday 4:00 UTC) | KMeans clustering of comment text |
| Branded Hashtag Sync | Weekly (Tuesday 4:15 UTC) | Fetch mentions for all registered branded hashtags |
| Story Snapshot | Every 4 hours | Capture live story metrics before 24h expiry |
| DM Funnel Runner | Every 15 min | Scan for trigger-keyword comments and send DMs |

---

### Tier 3 — Advanced Features (Complete ✅)

| Feature | Page | Description | Creator Benefit |
|---------|------|-------------|-----------------|
| Archive Import | `/dashboard/import` | Upload Instagram data export (JSON) for historical data beyond 90 days | Lifetime follower growth curve |
| Media Kit | `/dashboard/media-kit` | Auto-generated media kit with stats for brand pitches | Look professional when pitching sponsors |
| DM Automation | `/dashboard/automation` | Keyword-triggered comment-to-DM funnels | Automate lead capture from comments |
| Story Analytics | Integrated | Live story snapshots with insights before 24h expiry | Never lose story performance data |
| Trending Audio | Integrated | Instagram trending audio discovery (unofficial API) | Ride trending sounds for reach |
| Data Purge | API | Clean synthetic/demo data or full account reset | Clean slate without re-OAuth |

---

### Tier 4 — AI Copilot (Complete ✅)

| Feature | Description | Creator Benefit |
|---------|-------------|-----------------|
| Weekly AI Digest | Auto-generated Monday performance summary with recommendations | Actionable weekly briefing |
| AI Caption Generator | Generate captions based on your posting style + context | Save 30 min per post on copywriting |
| AI Comment Reply Suggestions | Draft replies matching your voice from recent reply samples | Reply faster, sound like yourself |
| AI Performance Diagnostics | Deep analysis of why specific posts over/underperformed | Learn from every post |
| AI Content Ideas | Audience-demand mining from question comments + format fatigue | Never run out of content ideas |
| AI Quota System | Per-user monthly call limits with usage tracking | Fair usage across all users |
| Circuit Breaker | Auto-disable AI calls after consecutive failures | Graceful degradation |

---

### YouTube Deep Features (Complete ✅)

| Feature | Page | Description |
|---------|------|-------------|
| Retention Studio | `/youtube/retention` | Per-video audience retention curves with annotations |
| Competitor Intelligence | `/youtube/competitors` | Track competitor channels, detect outlier videos |
| Predictive Studio | `/youtube/predict` | Revenue/view projections based on early velocity |
| Archive Miner | `/youtube/archive` | Weekly deep-dive into older videos for patterns |
| Funnel Analytics | `/youtube/funnel` | Viewer-to-subscriber conversion tracking |
| Webhook Intelligence | Background | PubSubHubbub real-time upload notifications |
| Golden Hour Alerts | Background | 60-min post-upload performance check |
| Velocity Tracking | Background | 4h/12h/24h competitor video velocity checks |

---

## 📊 Current Scale Metrics

| Dimension | Count |
|-----------|-------|
| Database Tables | 42 migration files |
| Backend Endpoints | ~80+ routes across auth, instagram, youtube, AI |
| Frontend Pages | 26 page components |
| Background Jobs | 10+ scheduled tasks |
| SQL Queries | 2,130 lines in queries.py |

> **Bottom line:** The platform already has a very mature feature set for Instagram + YouTube analytics. The roadmap going forward should focus on **monetization**, **scale**, **new platforms**, and **creator business tools**.

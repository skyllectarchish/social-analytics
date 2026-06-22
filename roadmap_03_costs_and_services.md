# InfluenceIQ — Product Roadmap (Part 3 of 4)
# Third-Party Services & Cost Analysis at 1,000 Users

---

## 🔌 Third-Party Services Catalog

### Currently Used Services

| Service | Purpose | Status |
|---------|---------|--------|
| **Instagram Graph API** (Meta) | OAuth, profile, media, insights, comments, stories, DMs | ✅ Active |
| **YouTube Data API v3** (Google) | Channel stats, video metrics, retention curves | ✅ Active |
| **YouTube Analytics API** (Google) | Detailed analytics, revenue data | ✅ Active |
| **ClickHouse Cloud** | Primary database (columnar analytics DB) | ✅ Active |
| **Anthropic Claude Haiku** | Sentiment analysis, comment categorization (batch) | ✅ Active |
| **Ollama Cloud** | AI Copilot features (captions, replies, digests, diagnostics) | ✅ Active |
| **instagrapi** (unofficial) | Trending audio discovery (private API) | ⚠️ Optional, ToS risk |

### Services Needed for Future Features

| Service | Purpose | Phase |
|---------|---------|-------|
| **TikTok Content Posting API** | TikTok analytics integration | Phase 2 |
| **X (Twitter) API v2** | Twitter analytics | Phase 2 |
| **Spotify for Podcasters API** | Podcast analytics | Phase 2 |
| **Google Perspective API** | Toxicity detection for comment moderation | Phase 4 |
| **SendGrid / Resend** | Email delivery (reports, alerts, digests) | Phase 1 |
| **Puppeteer / Playwright** | PDF generation for media kits & reports | Phase 1 |
| **Stripe API** | Revenue tracking from product sales | Phase 3 |
| **Shopify API** | E-commerce revenue correlation | Phase 3 |

---

## 💰 Detailed Cost Analysis — 1,000 Users Scenario

### Assumptions
- **1,000 registered users** (content creators)
- **~600 DAU** (60% daily active rate, typical for analytics SaaS)
- **~800 connected Instagram accounts** (80% connect rate)
- **~300 connected YouTube channels** (30% connect rate)
- Average creator has **~200 posts** and **~5,000 comments** stored
- AI features used by **~40%** of active users (~400 users)

---

### 1. Instagram Graph API (Meta)

| Item | Detail |
|------|--------|
| **API Cost** | **$0 — Completely Free** |
| **Rate Limit** | 200 API calls per hour per Instagram account |
| **Publishing Limit** | 100 API-published posts per 24 hours per account |
| **Requirements** | Meta Developer account, registered app, passed App Review |

#### API Call Budget at 1,000 Users

| Operation | Calls per user/day | × 800 users | Daily Total |
|-----------|-------------------|-------------|-------------|
| Profile fetch (daily sync) | 1 | 800 | 800 |
| Media list (daily sync, ~3 pages) | 3 | 800 | 2,400 |
| Account insights (5 metrics) | 5 | 800 | 4,000 |
| Demographic insights (4 breakdowns) | 4 | 800 | 3,200 |
| Media insights (per-post, ~20 posts) | 20 | 800 | 16,000 |
| Comment sync (~5 pages per user) | 5 | 800 | 4,000 |
| Story snapshots (4×/day, ~3 stories) | 12 | 800 | 9,600 |
| On-demand refreshes (~10% of users) | 5 | 80 | 400 |
| **Daily Total** | | | **~40,400 calls** |

> **Verdict:** At 200 calls/hr/account, each account can make 4,800 calls/day. The daily sync uses ~50 calls per account — well within limits. **No cost, no rate-limit risk.**

#### App Review Considerations

| Permission | Needed For | Review Difficulty |
|------------|-----------|-------------------|
| `instagram_business_basic` | Profile, media, basic metrics | ✅ Easy — standard use case |
| `instagram_business_manage_insights` | Account & media insights | ✅ Easy — analytics is approved use |
| `instagram_business_manage_comments` | Comment inbox, reply, moderation | 🟡 Medium — need clear use case demo |
| `instagram_business_manage_messages` | DM automation funnels | 🔴 Hard — Meta scrutinizes DM access heavily |
| `instagram_business_content_publish` | Content scheduling (future) | 🟡 Medium — need to demo publishing flow |

> [!WARNING]
> **DM permissions are the hardest to get approved.** Meta requires a video walkthrough, clear privacy policy, and demonstrated use case. Budget 2-4 weeks for review. If denied, the DM automation feature won't work.

---

### 2. YouTube Data API v3 (Google)

| Item | Detail |
|------|--------|
| **API Cost** | **$0 — Free** |
| **Quota** | 10,000 units/day per Google Cloud project (default) |
| **Quota Increase** | Free, but requires manual review (weeks-long process) |

#### Quota Budget at 300 YouTube Users

| Operation | Cost/call | Calls/user/day | Daily Units |
|-----------|-----------|----------------|-------------|
| `channels.list` | 1 unit | 1 | 300 |
| `videos.list` (batch 50 IDs) | 1 unit | 2 | 600 |
| `playlistItems.list` | 1 unit | 2 | 600 |
| `search.list` (competitor discovery) | 100 units | 0.1 | 3,000 |
| YouTube Analytics API (separate quota) | varies | 3 | 900 |
| **Daily Total** | | | **~5,400 units** |

> **Verdict:** 5,400 of 10,000 units used daily — **within default quota but tight**. Will need a quota increase request at ~500 YouTube users. Search operations are the bottleneck (100 units each).

> [!IMPORTANT]
> **Optimize YouTube API usage:**
> - Batch `videos.list` calls (up to 50 IDs per call = 1 unit instead of 50)
> - Cache `search.list` results aggressively (they don't change hourly)
> - Use PubSubHubbub webhooks instead of polling for new uploads
> - Request quota increase proactively at 300 users

---

### 3. ClickHouse Cloud

| Item | Detail |
|------|--------|
| **Pricing Model** | Consumption-based (compute + storage) |
| **Storage** | ~$0.025/GB/month (compressed) |
| **Compute** | ~$0.30/compute-unit/hour (Scale tier) |

#### Storage Estimate at 1,000 Users

| Table Group | Rows per User | Avg Row Size | Total Raw | Compressed (~10x) |
|-------------|---------------|-------------|-----------|-------------------|
| Users + Profiles | 2 | 500B | 1 MB | 0.1 MB |
| Instagram Media | 200 | 1 KB | 200 MB | 20 MB |
| Media Insights | 200 × 10 metrics | 100B | 200 MB | 20 MB |
| Account Insights | 365 days × 5 metrics | 100B | 182 MB | 18 MB |
| Comments | 5,000 | 500B | 2,500 MB | 250 MB |
| Comment Sentiment | 5,000 | 200B | 1,000 MB | 100 MB |
| Demographics | 50 entries | 200B | 10 MB | 1 MB |
| Competitor Snapshots | 5 × 365 days | 200B | 365 MB | 36 MB |
| YouTube Tables | ~500 rows | 300B | 150 MB | 15 MB |
| AI Tables | ~100 rows | 2 KB | 200 MB | 20 MB |
| **Total per 1K users** | | | **~4.8 GB** | **~480 MB** |

#### Monthly Cost Projection

| Component | Calculation | Monthly Cost |
|-----------|------------|--------------|
| Storage (480 MB compressed) | 0.48 GB × $0.025 | **$0.01** |
| Compute (Scale tier, always-on small) | ~2 CU × $0.30 × 730 hrs | **~$438** |
| Compute (with auto-suspend) | ~2 CU × $0.30 × ~200 hrs active | **~$120** |
| Backups | ~50% of storage | **$0.01** |
| Data transfer | ~10 GB egress | **$1.15** |
| **Monthly Total (auto-suspend)** | | **~$120-150** |
| **Monthly Total (always-on)** | | **~$440-500** |

> [!TIP]
> **Cost optimization:** Use ClickHouse Cloud's auto-suspend feature. At 1,000 users, the database doesn't need to be running 24/7 — most queries happen during business hours. Auto-suspend can cut compute costs by 60-70%.

> **Alternative: Self-hosted ClickHouse on a VPS ($20-40/mo)** — a single Hetzner CX32 (4 vCPU, 8 GB RAM, $8/mo) can handle 1,000 users easily. But you lose managed backups, monitoring, and auto-scaling.

---

### 4. Anthropic Claude Haiku (Sentiment Analysis)

| Item | Detail |
|------|--------|
| **Model** | Claude Haiku 4.5 |
| **Input** | $1.00 / million tokens |
| **Output** | $5.00 / million tokens |
| **Batch API** | 50% discount on standard rates |

#### Token Budget at 1,000 Users

| Operation | Frequency | Input Tokens | Output Tokens |
|-----------|-----------|--------------|---------------|
| Comment sentiment scoring | Every 60 min, ~50 comments/batch | ~500 tokens/comment | ~50 tokens/comment |
| Topic clustering (weekly) | Weekly, ~500 comments | ~500 tokens/comment | ~100 tokens/comment |

| Metric | Calculation | Monthly Total |
|--------|------------|---------------|
| New comments/day (1K users) | ~800 users × 10 new comments/day | ~8,000 comments/day |
| Monthly comments scored | 8,000 × 30 | 240,000 comments |
| Input tokens (sentiment) | 240K × 500 tokens | 120M tokens |
| Output tokens (sentiment) | 240K × 50 tokens | 12M tokens |
| Input cost | 120M / 1M × $1.00 | **$120** |
| Output cost | 12M / 1M × $5.00 | **$60** |
| **Monthly Total (standard)** | | **$180** |
| **Monthly Total (Batch API, 50% off)** | | **~$90** |

> [!TIP]
> **Use the Batch API.** Sentiment scoring is not time-sensitive — a 15-minute delay is fine. The Batch API gives 50% savings, bringing costs from $180 → $90/mo.

---

### 5. Ollama Cloud (AI Copilot)

| Item | Detail |
|------|--------|
| **Pricing** | Flat-rate monthly subscription |
| **Free** | $0/mo — 1 concurrent model, baseline usage |
| **Pro** | $20/mo — 3 concurrent models, 50× free tier |
| **Max** | $100/mo — 10 concurrent models, 250× free tier |

#### Usage Estimate at 1,000 Users

| Feature | Users/Day | Calls/User/Day | Daily Calls |
|---------|-----------|----------------|-------------|
| AI Digest (weekly auto) | 800 (weekly) | 1 | ~115/day avg |
| Caption Generator | 100 | 2 | 200 |
| Reply Suggestions | 80 | 5 | 400 |
| Diagnostics | 50 | 1 | 50 |
| Content Ideas | 40 | 1 | 40 |
| **Daily Total** | | | **~805 calls/day** |

> At ~800 AI calls/day with a 120B parameter model, the **Max plan ($100/mo)** should handle this volume. If usage exceeds 250× free tier limits, you'll need to:
> 1. Self-host an LLM on a dedicated GPU server ($150-400/mo for A10G instances), or
> 2. Switch to a per-token API provider (OpenAI, Anthropic) for the copilot features.

| Plan | Monthly Cost | Handles 1K Users? |
|------|-------------|-------------------|
| Free | $0 | ❌ Not enough for production |
| Pro | $20 | 🟡 Maybe tight |
| Max | $100 | ✅ Should work |

---

### 6. Application Hosting (Backend + Frontend)

#### Option A: VPS (Recommended for 1K Users)

| Provider | Spec | Monthly Cost |
|----------|------|-------------|
| **Hetzner CX32** | 4 vCPU, 8 GB RAM, 80 GB SSD | **€7.49 (~$8)** |
| **Hetzner CX42** | 4 vCPU, 16 GB RAM, 160 GB SSD | **€14.49 (~$16)** |
| **DigitalOcean** | 4 vCPU, 8 GB RAM | **$48** |
| **DigitalOcean** | 2 vCPU, 4 GB RAM | **$24** |

> **Recommendation:** Start with **Hetzner CX32 ($8/mo)** for the FastAPI backend. Deploy frontend as static files on **Cloudflare Pages (free)** or same VPS behind Nginx.

#### Option B: PaaS (Higher Cost, Less Management)

| Provider | Monthly Cost |
|----------|-------------|
| Railway | $5 base + usage (~$20-40 at 1K users) |
| Render | $7/service × 2 = $14 minimum |
| Fly.io | $5-15 depending on usage |

#### Frontend Hosting (Static SPA)

| Provider | Monthly Cost |
|----------|-------------|
| Cloudflare Pages | **$0 (free)** — unlimited bandwidth |
| Vercel | $0 (free tier) — 100 GB bandwidth |
| Netlify | $0 (free tier) — 100 GB bandwidth |

---

### 7. Additional Services

| Service | Purpose | Monthly Cost |
|---------|---------|-------------|
| **Domain + SSL** | Custom domain | $10-15/year ($1/mo) |
| **Cloudflare (free)** | CDN, DDoS protection, DNS | $0 |
| **Resend** (email) | Transactional emails, weekly digests | $0 (3K emails/mo free) |
| **Sentry** (error tracking) | Production error monitoring | $0 (5K events/mo free) |
| **Uptime monitoring** | BetterStack / UptimeRobot | $0 (free tier) |
| **GitHub** | Source control | $0 (free for private repos) |

---

## 📊 Total Monthly Cost Summary — 1,000 Users

### Minimum Viable (Cost-Optimized)

| Service | Monthly Cost |
|---------|-------------|
| Instagram Graph API | $0 |
| YouTube Data API | $0 |
| ClickHouse Cloud (auto-suspend) | $120 |
| Claude Haiku (Batch API) | $90 |
| Ollama Max | $100 |
| Hetzner VPS (backend) | $8 |
| Cloudflare Pages (frontend) | $0 |
| Domain + DNS | $1 |
| Email (Resend free tier) | $0 |
| **TOTAL** | **~$319/mo** |

### Comfortable (Production-Ready)

| Service | Monthly Cost |
|---------|-------------|
| Instagram Graph API | $0 |
| YouTube Data API | $0 |
| ClickHouse Cloud (always-on) | $450 |
| Claude Haiku (standard API) | $180 |
| Ollama Max | $100 |
| Hetzner CX42 (backend) | $16 |
| Cloudflare Pages (frontend) | $0 |
| Domain + DNS | $1 |
| Sentry (paid) | $26 |
| Resend (paid) | $20 |
| **TOTAL** | **~$793/mo** |

### With Future Features (Full Platform)

| Service | Monthly Cost |
|---------|-------------|
| Everything above (comfortable) | $793 |
| X (Twitter) API Basic | $200 |
| TikTok API | $0 |
| GPU server for self-hosted LLM | $200 |
| Additional VPS for workers | $16 |
| **TOTAL** | **~$1,209/mo** |

---

## 💵 Per-User Cost Breakdown

| Scenario | Monthly Total | Per User/Month | Per User/Year |
|----------|--------------|----------------|---------------|
| **Cost-Optimized** | $319 | **$0.32** | **$3.83** |
| **Production-Ready** | $793 | **$0.79** | **$9.52** |
| **Full Platform** | $1,209 | **$1.21** | **$14.51** |

> [!IMPORTANT]
> **At $0.32-$1.21 per user per month in infrastructure costs, this is an extremely viable SaaS business.** Even a modest $9.99/mo subscription with 1,000 users generates $9,990/mo in revenue against $319-$1,209 in costs — a **87-97% gross margin**. The biggest cost lever is ClickHouse Cloud compute; self-hosting ClickHouse on a VPS would drop total costs to ~$200/mo.

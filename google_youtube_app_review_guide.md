# Google / YouTube App Review — Complete Guide (Zero to Published)

A step-by-step guide to create a Google Cloud project, enable the YouTube APIs, configure OAuth, and pass verification so **any** YouTube creator can connect their channel to InfluenceIQ.

---

## Understanding the Portals

Unlike Meta (which has two confusing portals), Google centralizes almost everything in **one place**. But there are a few different sections within it:

| Portal / Section | URL | What it's for |
|---|---|---|
| **Google Cloud Console** | [console.cloud.google.com](https://console.cloud.google.com/) | **Your home base.** Create your project, enable APIs, create OAuth credentials, configure the consent screen, manage quotas, and submit for verification — 95% of the work happens here. |
| **Google Search Console** | [search.google.com/search-console](https://search.google.com/search-console) | **One-time visit.** You come here only to verify ownership of your production domain. Required before submitting for OAuth verification. |
| **PubSubHubbub Hub** | [pubsubhubbub.appspot.com](https://pubsubhubbub.appspot.com/) | **Webhook subscriptions.** You'll use this (programmatically) to subscribe to YouTube channel feeds for the Outlier Detection and Golden Hour features. No manual setup needed — your backend code handles it. |

> [!IMPORTANT]
> Unlike Meta, Google does **not** require a separate "Business Verification" process. There is no equivalent of Meta's Business Manager document upload. Your app is verified purely through the OAuth consent screen review process.

---

## PART 1 — Create the Google Cloud Project (Skip if already done)

If you've already created a project at `console.cloud.google.com`, jump to [Part 2](#part-2--enable-the-youtube-apis).

### Step 1.1 — Create a Google Cloud Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Sign in with a Google account (use the same account you'll use long-term for this project)
3. If prompted, accept the Google Cloud Terms of Service
4. You may be asked to set up a billing account — the YouTube APIs are **free** to use within quota limits, but Google requires a billing account to be linked to the project

> [!NOTE]
> You will NOT be charged for YouTube API usage. The billing account is just a Google requirement for enabling APIs. You can set a budget alert at $0 if you're worried.

### Step 1.2 — Create a New Project

1. Click the **Project Selector** dropdown at the top of the page
2. Click **New Project**
3. Fill in:
   - **Project Name**: `InfluenceIQ` (or whatever you want — this is internal, users never see it)
   - **Organization**: Leave as "No organization" unless you have a Google Workspace org
   - **Location**: Leave default
4. Click **Create**
5. Wait a few seconds, then select the new project from the project dropdown

Your project is now created. You'll land on the **Project Dashboard**.

### Step 1.3 — Note Your Project ID

1. On the Dashboard, note your **Project ID** (shown below the project name)
2. You'll need this later for quota increase requests

---

## PART 2 — Enable the YouTube APIs

You need to enable **three separate APIs** in the API Library. Each one is a distinct toggle.

### Step 2.1 — Enable APIs

1. In the left sidebar, go to **APIs & Services → Library**
2. Search for and **Enable** each of the following:

| API Name | Search Term | What it gives you |
|---|---|---|
| **YouTube Data API v3** | `YouTube Data API` | Channel info, video metadata, comments, playlists, search. This is the core API. |
| **YouTube Analytics API** | `YouTube Analytics API` | Per-video and per-channel analytics: views, watch time, retention, traffic sources, demographics. |
| **YouTube Reporting API** | `YouTube Reporting API` | Bulk daily CSV report downloads (used for backfill and historical data). Optional but recommended. |

3. For each: click the API name in search results → click **Enable**

> [!TIP]
> After enabling, you can verify all three are active by going to **APIs & Services → Dashboard** and checking the "Enabled APIs" list.

---

## PART 3 — Create OAuth 2.0 Credentials

### Step 3.1 — Configure the OAuth Consent Screen

This is the screen users see when they click "Connect YouTube" in your app. **You must configure this before creating credentials.**

1. Go to **APIs & Services → OAuth consent screen**
2. Select User Type: **External** (this means anyone with a Google account can use it)
3. Click **Create**
4. Fill in the **App Information**:

| Field | What to enter |
|---|---|
| **App Name** | `InfluenceIQ` |
| **User Support Email** | Your support email |
| **App Logo** | Upload your app logo (optional now, required for verification later) |
| **App Domain — Application Home Page** | `https://your-domain.com` |
| **App Domain — Privacy Policy Link** | `https://your-domain.com/privacy` |
| **App Domain — Terms of Service Link** | `https://your-domain.com/terms` |
| **Authorized Domains** | `your-domain.com` (your production domain) |
| **Developer Contact Email** | Your email |

5. Click **Save and Continue**

### Step 3.2 — Add Scopes

1. Click **Add or Remove Scopes**
2. Search for and add the following scopes:

| Scope | Classification | Purpose |
|---|---|---|
| `https://www.googleapis.com/auth/youtube.readonly` | **Sensitive** | Read the user's channel info, videos, playlists, and comments |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | **Sensitive** | Read YouTube Analytics data (views, watch time, retention, traffic sources, demographics) |
| `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` | **Sensitive** | Read estimated revenue, RPM, CPM (only for YPP channels). **Only add this if you are building the Revenue Dashboard feature.** |

3. Click **Update** → **Save and Continue**

> [!IMPORTANT]
> **Keep scopes minimal!** Only request `yt-analytics-monetary.readonly` if you are actually building the revenue features. Requesting unnecessary scopes makes verification harder and raises reviewer suspicion. All three scopes above are classified as **Sensitive** (not Restricted), which means you will NOT need a paid CASA security audit — just a standard verification review.

### Step 3.3 — Add Test Users

While your app is in "Testing" mode:

1. Click **Add Users**
2. Enter the Gmail addresses of your test accounts (up to 100)
3. Click **Save**

> [!WARNING]
> In Testing mode, **refresh tokens expire every 7 days**. This means your test users will need to re-authenticate weekly. This is a Google limitation that goes away once the app is verified and published.

### Step 3.4 — Create the OAuth Client ID

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Select Application Type: **Web application**
4. Fill in:
   - **Name**: `InfluenceIQ Web Client`
   - **Authorized JavaScript Origins**: 
     - `https://localhost:5173` (development)
     - `https://your-domain.com` (production)
   - **Authorized Redirect URIs**:
     - `https://localhost:5173/auth/youtube/callback` (development)
     - `https://your-domain.com/auth/youtube/callback` (production)
5. Click **Create**
6. A dialog will show your **Client ID** and **Client Secret** — note both down

These map to your `.env` file:
```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=https://localhost:5173/auth/youtube/callback
```

> [!CAUTION]
> Never commit the Client Secret to version control. Store it only in `.env` files that are in `.gitignore`.

---

## PART 4 — Prepare Prerequisites for Verification

Before submitting for verification, Google requires several things. **Missing items cause delays or rejection.**

### 4.1 — Privacy Policy Page ⚠️ REQUIRED

Create and host a Privacy Policy page. It must:
- Be **publicly accessible** (no login required)
- Be **hosted on HTTPS** on a domain you own
- Be **linked from your app's homepage** (Google checks this!)
- **Explicitly reference Google API data** — this is unique to Google and different from your Meta privacy policy

**What to include (in addition to your existing IG privacy policy content):**
- Data collected from YouTube: channel info, video metadata, analytics metrics, comments, revenue estimates
- How you store it: ClickHouse database, encrypted at rest
- How long you retain it: indefinitely for historical analytics
- Third parties who process it: Ollama Cloud (AI features), Anthropic (sentiment analysis)
- **Required compliance statement** — you MUST include this exact language or equivalent:

> *"InfluenceIQ's use and transfer of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements."*

> [!CAUTION]
> This compliance statement is **mandatory**. Google reviewers specifically look for it. Missing it = rejection.

### 4.2 — Terms of Service Page ⚠️ REQUIRED

Same as your existing Terms of Service — host it on your domain and link it from the consent screen configuration (already done in Step 3.1).

### 4.3 — App Homepage ⚠️ REQUIRED

Unlike Meta, Google has specific requirements for your homepage:
- Must be hosted on a **verified domain** (see 4.4)
- Must **accurately describe your app's functionality**
- **Cannot** be just a login page — it needs to describe what InfluenceIQ does before asking the user to sign in
- Must link to your Privacy Policy

Your existing Landing page component already satisfies this if it has a description of the app and a link to the privacy policy.

### 4.4 — Domain Verification ⚠️ REQUIRED

You must prove you own the domain used in your OAuth consent screen:

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click **Add Property**
3. Choose **URL prefix** and enter `https://your-domain.com`
4. Verify ownership using one of the methods:
   - **HTML file upload** (recommended) — download a file and place it in your frontend's `public/` folder
   - **HTML meta tag** — add a `<meta>` tag to your `index.html`
   - **DNS record** — add a TXT record at your domain registrar
5. Once verified, go back to the **Google Cloud Console → OAuth consent screen**
6. Your domain should now appear as a verified authorized domain

### 4.5 — App Logo

1. Upload a logo in the OAuth consent screen settings
2. Requirements:
   - Square image (recommended 120×120px, will be displayed at various sizes)
   - No Google branding or logos
   - Represents your app

---

## PART 5 — Prepare for Submission

### 5.1 — Make Successful API Calls

Before submitting, you **should have tested the complete flow** with your test users. This isn't a hard requirement like Meta, but it ensures your scopes are configured correctly:

| Scope | How to trigger it |
|---|---|
| `youtube.readonly` | Complete the OAuth flow → call `channels.list?part=snippet,statistics&mine=true` to fetch the connected channel |
| `yt-analytics.readonly` | Trigger an analytics sync job that queries the YouTube Analytics API for views, watch time, and retention data |
| `yt-analytics-monetary.readonly` | Query revenue metrics for a monetized test channel (skip if not building revenue features yet) |

### 5.2 — Create Test Credentials for Reviewers

Google reviewers need to see your app working. Unlike Meta, Google reviewers **do not log into your app directly** — they watch your demo video. However, you should still have a clean test environment ready:

1. Ensure your app is deployed to a **public HTTPS URL**
2. Have at least one YouTube channel connected with **real synced data**
3. Verify the entire flow works in an **incognito browser**

### 5.3 — Record Your Demo Video

The demo video is the **most important part** of Google's verification. Reviewers rely on it heavily.

**Requirements:**

| Rule | Detail |
|---|---|
| Format | Upload to YouTube as **Unlisted**, or host on a public URL |
| Length | 2–5 minutes (shorter is better — be concise) |
| Content | Must show the OAuth consent screen (with your app name visible), the authorization flow, and how each requested scope's data is used in the app |
| URL Bar | Keep the browser URL bar visible so reviewers can see the OAuth redirect URLs |

**Recommended script:**

```
TIMESTAMP   WHAT TO SHOW                                          SCOPE DEMONSTRATED
─────────   ──────────────────────────────────────────────────    ──────────────────
0:00-0:20   Introduce: "This is InfluenceIQ, an analytics        (intro)
            dashboard for content creators..."

0:20-0:40   Show the app homepage (NOT just a login page)         (homepage req)
            Point out the Privacy Policy link in the footer

0:40-1:15   Click "Connect YouTube" → Google OAuth consent        youtube.readonly
            screen appears → show the app name and scopes
            listed → click "Allow"

1:15-1:45   Callback completes → Dashboard loads →                youtube.readonly
            point out channel name, subscriber count,
            profile picture, video list

1:45-2:30   Show analytics dashboard: watch time trends,          yt-analytics.readonly
            retention curves, traffic source breakdown,
            audience demographics → explain "these metrics
            come from the YouTube Analytics API"

2:30-3:15   Show per-video analytics: click a video →             yt-analytics.readonly
            retention chart, CTR, views over time

3:15-3:45   (If applicable) Show revenue dashboard:               yt-analytics-monetary.readonly
            estimated revenue, RPM, CPM, monetized
            playbacks → explain "this requires the
            monetary analytics scope"

3:45-4:15   Show data sync / background job in action:            (all scopes)
            click Sync → data refreshes → updated numbers

4:15-4:30   Wrap up: "InfluenceIQ stores this data                (conclusion)
            long-term for historical trend analysis..."
```

> [!TIP]
> Upload the video as **Unlisted on YouTube** — this is the easiest way to share a stable URL with Google reviewers. Do NOT make it private (they can't access private videos).

---

## PART 6 — Submit for Verification

### 6.1 — Navigate to the Verification Page

1. Go to **APIs & Services → OAuth consent screen**
2. At the top, you'll see a banner or button: **"Publish App"** or **"Submit for Verification"**
3. If you see "Publish App" — click it. Google will warn you that your app uses sensitive scopes and needs verification.
4. Click **"Confirm"** to begin the verification process

### 6.2 — Fill in the Verification Form

You'll be asked to provide:

| Field | What to enter |
|---|---|
| **Scopes Justification** | A written explanation for each sensitive scope (see 6.3 below) |
| **Demo Video URL** | The unlisted YouTube link or public URL of your screencast |
| **Homepage URL** | `https://your-domain.com` |
| **Privacy Policy URL** | `https://your-domain.com/privacy` |
| **Terms of Service URL** | `https://your-domain.com/terms` |

### 6.3 — Write Scope Justifications

For each scope, clearly explain **why** your app needs it. Here are ready-to-use descriptions:

---

#### `youtube.readonly`

> InfluenceIQ is a cross-platform analytics dashboard for content creators. We use the `youtube.readonly` scope to retrieve the authenticated user's YouTube channel information (channel name, description, profile picture, subscriber count, total view count, video count) displayed on the dashboard header and profile sidebar. We also retrieve the user's complete video catalog (video titles, descriptions, tags, thumbnails, publish dates, duration, view counts, like counts, comment counts) for the Content Lab and video performance analysis sections. Video comments are retrieved for AI-powered sentiment analysis and topic clustering. All data is stored in our database for long-term historical tracking, enabling creators to monitor growth trends over months and years — including preserving analytics for videos that may later be deleted.

---

#### `yt-analytics.readonly`

> InfluenceIQ uses the `yt-analytics.readonly` scope to power the core YouTube analytics experience. We query the YouTube Analytics API for: (1) channel-level daily metrics including views, estimated minutes watched, subscriber gains/losses, and average view duration; (2) per-video audience retention curves (`audienceWatchRatio` and `relativeRetentionPerformance`) which power our Retention Analysis feature that identifies hook strength, drop-off cliffs, and replay peaks; (3) traffic source breakdowns (`insightTrafficSourceType`) showing how viewers discover each video; (4) impression and click-through-rate data powering our CTR Intelligence dashboard; (5) audience demographics (age group, gender, country) for the Audience DNA section; and (6) search term data (`insightTrafficSourceDetail`) for our Search Intelligence feature. These analytics are synced daily via a background job and stored permanently, enabling period-over-period comparisons and long-term trend analysis.

---

#### `yt-analytics-monetary.readonly` (only if building Revenue Dashboard)

> InfluenceIQ uses `yt-analytics-monetary.readonly` to provide monetized YouTube creators with a comprehensive revenue analytics dashboard. We retrieve estimated revenue, estimated ad revenue, YouTube Premium revenue share, playback-based CPM, and monetized playback counts. This data powers: (1) revenue trend charts showing earnings over time, (2) per-video RPM calculations revealing true revenue efficiency, (3) revenue breakdown by traffic source and geography helping creators understand which audiences generate the most ad revenue, (4) revenue comparison between Shorts and long-form content, and (5) monthly revenue forecasts (clearly labeled as estimates). All monetary figures are displayed with prominent disclaimers noting they are estimates that reconcile in AdSense. Access to this scope is strictly read-only.

---

### 6.4 — Submit! 🚀

Review everything one more time, then submit.

---

## PART 7 — After Submission

### Timeline

| Stage | Typical Duration |
|---|---|
| Initial review | 3–5 business days |
| Complex cases (many scopes) | Up to 2–3 weeks |
| Follow-up after reviewer questions | 2–5 business days |

### Possible Outcomes

| Outcome | What to do |
|---|---|
| ✅ **Approved** | Your app is verified. The "Unverified app" warning is removed. Any Google user can now authorize your app. Refresh tokens no longer expire after 7 days. |
| ⚠️ **Needs Info** | Google emails you asking for clarification, a better video, or a policy update. Fix the **exact issue** they mention and respond via email. |
| ❌ **Rejected** | Read the feedback carefully. Most common fixes: update privacy policy wording, improve demo video, remove unnecessary scopes. Fix and resubmit. |

### Do I Need a CASA Security Audit?

**Almost certainly NO** for your use case. Here's why:

| Scope Type | CASA Audit Required? | Your Scopes |
|---|---|---|
| **Non-sensitive** (e.g., `openid`, `email`) | ❌ No | — |
| **Sensitive** (e.g., `youtube.readonly`, `yt-analytics.readonly`) | ❌ No — standard review only | ✅ All your scopes are here |
| **Restricted** (e.g., `gmail.readonly`, `drive.file`) | ✅ Yes — paid third-party audit | ❌ You don't use any of these |

Since all YouTube `readonly` scopes are classified as **Sensitive** (not Restricted), you undergo a **standard verification review** — no paid security audit, no third-party lab. This is a major advantage over apps requesting Gmail or Drive access.

### After Approval — Publishing Status

Once approved:
1. Your app's OAuth consent screen status changes from "Testing" to **"In Production"**
2. The 100-user limit is removed
3. Refresh tokens become long-lived (6 months, auto-renewed on use)
4. The "This app isn't verified" warning screen is removed for users

---

## PART 8 — Quota Management (Critical for YouTube)

Unlike Meta (which has generous rate limits), **YouTube API quota is the #1 operational risk** for your app. Plan for it from day one.

### Default Quotas

| API | Default Daily Quota | Per-Request Cost |
|---|---|---|
| YouTube Data API v3 | **10,000 units/day** per project | Most reads = 1 unit; `search.list` = **100 units** |
| YouTube Analytics API | Much higher (effectively unlimited for reasonable use) | No unit-based quota system |
| YouTube Reporting API | No quota limit (bulk CSV downloads) | Free |

### How Quota Gets Burned

| Operation | Cost | When it happens |
|---|---|---|
| `channels.list` | 1 unit | OAuth callback, channel sync |
| `videos.list` | 1 unit | Video metadata sync, Golden Hour velocity check |
| `commentThreads.list` | 1 unit | Comment sentiment sync |
| `search.list` | **100 units** | ⚠️ AVOID — use WebSub webhooks instead |
| `playlistItems.list` | 1 unit | Fetching a channel's uploads playlist |

### How to Request a Quota Increase

You will likely need this once you have more than ~50 active users:

1. Go to **APIs & Services → YouTube Data API v3 → Quotas**
2. Click **"Edit Quotas"** (pencil icon)
3. Fill in the **Quota Increase Request Form**:
   - Describe your app and its use case
   - Explain your expected usage pattern (e.g., "Daily sync of channel/video metadata for N users, ~3 API calls per user per day")
   - Include a link to your deployed app
4. Submit — approval typically takes **1–4 weeks**
5. Google usually grants 50,000–1,000,000 units/day for legitimate analytics apps

> [!WARNING]
> **Design your architecture to minimize quota usage from day one.** Use WebSub webhooks for real-time updates (0 quota), cache video metadata aggressively (24h TTL), and batch API calls wherever possible. The Architecture Miner and Outlier Detection features are specifically designed around this constraint.

---

## Pre-Submission Checklist

Go through this list before submitting for verification:

```
PART 2 — APIs Enabled
  [ ] YouTube Data API v3 enabled
  [ ] YouTube Analytics API enabled
  [ ] YouTube Reporting API enabled (optional)

PART 3 — OAuth Credentials
  [ ] OAuth consent screen configured (External)
  [ ] Scopes added (youtube.readonly, yt-analytics.readonly, + monetary if needed)
  [ ] Test users added (your Gmail addresses)
  [ ] OAuth Client ID created (Web application type)
  [ ] Redirect URIs configured (must match GOOGLE_REDIRECT_URI in .env)
  [ ] Client ID and Client Secret saved to .env

PART 4 — Prerequisites
  [ ] Privacy Policy page — live, HTTPS, tested in incognito
  [ ] Privacy Policy includes Google API User Data Policy compliance statement
  [ ] Terms of Service page — live, HTTPS, tested in incognito
  [ ] App Homepage — describes the app, links to privacy policy, NOT just a login page
  [ ] Domain verified in Google Search Console
  [ ] App logo uploaded in consent screen settings

PART 5 — Preparation
  [ ] Full OAuth flow tested with a test user account
  [ ] At least one successful API call per requested scope
  [ ] App deployed to public HTTPS URL
  [ ] Redirect URIs updated to production URL
  [ ] Full flow tested in incognito browser
  [ ] Demo video recorded (unlisted YouTube video or public URL)

PART 6 — Submission
  [ ] Scope justifications written for each scope
  [ ] Demo video URL provided
  [ ] All URLs verified accessible
```

---

## Common Rejection Reasons (Avoid These!)

| # | Mistake | Fix |
|---|---|---|
| 1 | **Privacy Policy missing Google API User Data Policy compliance statement** | Add the exact "adheres to Google API Services User Data Policy" language |
| 2 | **Homepage is just a login page** | Add a landing page that describes what the app does before requiring sign-in |
| 3 | **Demo video doesn't show the OAuth consent screen** | Re-record with the browser URL bar visible showing the consent screen |
| 4 | **Requesting unnecessary scopes** | Remove any scope not demonstrated in your video (especially `yt-analytics-monetary.readonly` if you haven't built revenue features yet) |
| 5 | **Privacy Policy URL is not accessible** | Test in incognito — no login walls, no broken links |
| 6 | **Domain not verified in Search Console** | Complete domain verification before submitting |
| 7 | **Demo video is set to Private on YouTube** | Change to **Unlisted** so reviewers can access it |
| 8 | **Vague scope justification** | Be specific: "We use X to display Y in the Z section of our dashboard" |
| 9 | **App logo contains Google/YouTube branding** | Use your own InfluenceIQ branding only |
| 10 | **Privacy policy doesn't mention YouTube data specifically** | Update to list the exact YouTube data types you collect and store |

---

## Your App's Scope Map

Quick reference: which scopes power which features in InfluenceIQ.

```
youtube.readonly
  └── Channel info (name, bio, picture, subscribers, total views)
  └── Video catalog (titles, descriptions, tags, thumbnails, durations)
  └── Video public stats (views, likes, comments — rolling sync)
  └── Comments (for sentiment analysis & topic clustering)
  └── Competitor channel public data (Outlier Detection)
  └── Shorts vs Long-Form classification (derived from duration + aspect ratio)

yt-analytics.readonly
  └── Dashboard KPI cards (Views, Watch Time, Subscribers, AVD)
  └── Audience Retention curves (hook strength, drop-off cliffs, replay peaks)
  └── CTR Intelligence (impression click-through rate by traffic source)
  └── Traffic Source breakdown (Search, Suggested, Browse, External, Shorts)
  └── Search Term Intelligence (queries driving views)
  └── Subscriber Source Attribution (which videos earn subs)
  └── Audience Demographics (age, gender, country, device)
  └── Period-over-period comparisons
  └── AI Copilot (weekly digest, flop diagnostic — uses analytics as input)
  └── Golden Hour velocity check (first-hour performance alert)

yt-analytics-monetary.readonly  ← OPTIONAL (only for Revenue Dashboard)
  └── Revenue trend charts
  └── Per-video RPM calculations
  └── Revenue by geography and traffic source
  └── Revenue by content format (Shorts vs long-form)
  └── Monthly revenue forecast (labeled as estimate)
  └── Membership & Super Chat tracking
```

---

## Key Differences from the Meta App Review Process

For your reference, since you've already been through the Meta process:

| Aspect | Meta (Instagram) | Google (YouTube) |
|---|---|---|
| **Portals** | Two separate portals (Developers + Business Suite) | One portal (Google Cloud Console) + Search Console for domain verification |
| **Business Verification** | Required — upload legal documents to Business Manager | Not required — no document upload |
| **Security Audit** | Not required for basic IG scopes | Not required for `readonly` YouTube scopes (CASA only applies to Restricted scopes like Gmail) |
| **Test User Limits** | Role-based (Instagram Testers) | 100 Gmail addresses in Testing mode |
| **Token Expiry (Testing)** | Long-lived tokens (60 days) even in dev mode | **7-day expiry** in Testing mode — goes away after verification |
| **Demo Video** | Screencast uploaded to submission form | Unlisted YouTube video or public URL |
| **Reviewer Access** | Reviewers log into your app with test credentials | Reviewers watch your video — they typically do NOT log in |
| **Review Timeline** | 2–7 business days | 3–5 business days (can be longer) |
| **Annual Requirement** | Data Use Checkup | Re-verification if using restricted scopes (not applicable to you) |
| **Quota Risk** | Low (generous rate limits) | **High** — 10,000 units/day default. Must design for efficiency from day one. |
| **Webhooks** | Rich (comments, mentions, stories) | Limited (upload & metadata changes only via WebSub) |

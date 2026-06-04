# Meta App Review — Complete Guide (Zero to Published)

A step-by-step guide to create a Meta/Instagram app from scratch and publish it so **any** Instagram Business/Creator account can use InfluenceIQ.

---

## Understanding the Two Portals

There are **two separate Meta portals** that serve different purposes. This confuses almost everyone, so let's clear it up first:

| Portal | URL | What it's for |
|---|---|---|
| **Meta for Developers** (App Dashboard) | [developers.facebook.com/apps](https://developers.facebook.com/apps) | **Your home base.** Create your app, configure Instagram Login, set permissions, upload policy URLs, add test users, submit for App Review — 95% of the work happens here. |
| **Meta Business Suite** (Business Manager) | [business.facebook.com](https://business.facebook.com) | **One-time visit.** You come here only to complete **Business Verification** — proving your business is real by uploading legal documents. This is a prerequisite for Advanced Access. |

> [!IMPORTANT]
> These are **separate accounts/logins in the same Meta ecosystem**. Your Developer App must be linked to a Business Portfolio. If you haven't done this, you'll be prompted when you try to request Advanced Access.

---

## PART 1 — Create the App (Skip if already done)

If you've already created your app at `developers.facebook.com/apps`, jump to [Part 2](#part-2--configure-instagram-login-product).

### Step 1.1 — Create a Meta Developer Account

1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Click **Get Started** (top-right)
3. Log in with your personal Facebook account
4. Accept the Meta Platform Terms
5. Verify your account (email or phone)

You now have a Meta Developer account.

### Step 1.2 — Create a New App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click **Create App**
3. You'll see a screen asking **"What do you want your app to do?"**
4. Select **"Other"** → Click **Next**
5. Select app type: **"Consumer"** (or "Business" if you plan to manage other people's IG accounts) → Click **Next**
6. Fill in:
   - **App Name**: `InfluenceIQ` (or whatever you want users to see)
   - **App Contact Email**: your email
   - **Business Portfolio**: select one if you have it, or create one (you'll need this for verification later)
7. Click **Create App**
8. Enter your Facebook password to confirm

Your app is now created. You'll land on the **App Dashboard**.

### Step 1.3 — Note Your App Credentials

1. In the App Dashboard, go to **Settings → Basic** (left sidebar)
2. Note down:
   - **App ID** → this is your `META_APP_ID` in `.env`
   - **App Secret** → click "Show", enter password → this is your `META_APP_SECRET` in `.env`

---

## PART 2 — Configure Instagram Login Product

### Step 2.1 — Add the Instagram Product

1. In your App Dashboard, go to the left sidebar
2. Scroll down and click **Add Product** (or look for the **+** icon)
3. Find **"Instagram"** in the product list
4. Click **Set Up** on the Instagram card
5. Choose **"API setup with Instagram Login"** — this is the direct Instagram Login flow (no Facebook Page required)

### Step 2.2 — Configure OAuth Settings

1. In the left sidebar, go to **Instagram → API setup with Instagram Login**
2. Under **Client OAuth Settings**, add your **Valid OAuth Redirect URIs**:
   - For development: `https://localhost:5173/auth/instagram/callback`
   - For production: `https://your-domain.com/auth/instagram/callback`
   
   > This must exactly match the `META_REDIRECT_URI` value in your [backend/.env](file:///c:/laragon/www/social-analytics/backend/.env.example)

3. Under **Deauthorize Callback URL**, add: `https://your-domain.com/api/instagram/deauthorize` (you may need to create this endpoint later)
4. Under **Data Deletion Request URL**, add your data deletion callback URL (covered in Part 3)
5. Click **Save Changes**

### Step 2.3 — Add Instagram Testers

While your app is in Development Mode, only people with roles can use it:

1. Go to **App Roles → Roles** in the left sidebar
2. Click **Add Instagram Testers**
3. Enter the Instagram username of the account you want to test with
4. That person must then go to their **Instagram app → Settings → Website Permissions → Tester Invites** and accept the invitation

> [!NOTE]
> Your Instagram account must be a **Business or Creator** account (not Personal). Switch in: Instagram app → Settings → Account Type → Switch to Professional Account.

---

## PART 3 — Prepare Prerequisites for App Review

Before you can submit for App Review, Meta requires several things to be in place. **Do not skip any of these** — missing items cause instant rejection.

### 3.1 — Privacy Policy Page ⚠️ REQUIRED

Create and host a Privacy Policy page. It must be:
- **Publicly accessible** (no login required)
- **Hosted on HTTPS**
- Cover how you collect, store, and use Instagram data

**What to include:**
- Data collected: Instagram profile info, media posts, engagement metrics, comments, insights
- Storage: ClickHouse Cloud database, encrypted at rest
- Retention: Data stored indefinitely for long-term analytics (this is your product's value)
- Third parties: Ollama Cloud (AI features), Anthropic (sentiment analysis)
- User rights: How to request data deletion or account disconnection
- Contact information

**Where to configure:**
1. App Dashboard → **Settings → Basic**
2. Paste your Privacy Policy URL in the **Privacy Policy URL** field

> [!CAUTION]
> Test this URL in an **incognito/private browser window**. A broken link = instant rejection.

### 3.2 — Terms of Service Page ⚠️ REQUIRED

Same as above — host a Terms of Service page and add the URL:

1. App Dashboard → **Settings → Basic**
2. Paste in the **Terms of Service URL** field

### 3.3 — Data Deletion Request ⚠️ REQUIRED

Meta requires you to handle user data deletion requests. Two options:

**Option A — Callback URL (recommended):**
Build an endpoint that Meta can call when a user wants their data deleted. Your app already has disconnect/purge logic.

**Option B — Instructions URL:**
Host a page that tells users: *"To delete your data, log into InfluenceIQ → Settings → Disconnect Account → Purge Data"*

**Where to configure:**
1. App Dashboard → **Settings → Basic**
2. Scroll to **Data Deletion** section
3. Choose your method and paste the URL

### 3.4 — App Icon ⚠️ REQUIRED

1. App Dashboard → **Settings → Basic**
2. Upload a **1024×1024px** app icon
   - No transparency
   - No Instagram/Meta branding or logos
   - Represents your app (InfluenceIQ logo)

### 3.5 — App Description

1. App Dashboard → **Settings → Basic**
2. Fill in the **App Description** field with a clear summary, e.g.:

> *InfluenceIQ is an analytics dashboard for Instagram content creators. It connects to Instagram Business/Creator accounts via the Graph API to provide long-term insights tracking, engagement analytics, audience demographics, content performance analysis, and AI-powered content recommendations — going beyond Instagram's native 90-day data retention limit.*

### 3.6 — Verify All Settings → Basic Fields

Scroll through **Settings → Basic** and make sure ALL fields are filled in:

```
✅ App Domains          → your production domain
✅ Privacy Policy URL   → live, accessible link
✅ Terms of Service URL → live, accessible link
✅ Data Deletion        → callback URL or instruction page
✅ App Icon             → 1024×1024 uploaded
✅ Category             → "Business" or "Utilities"
```

Click **Save Changes**.

---

## PART 4 — Business Verification (One-Time, on the Other Portal)

This is the **only step** that happens on `business.facebook.com`, not the developer portal.

### Why?
Meta needs to verify you are a real business/person before they let your app access other people's Instagram data. This is a trust gate.

### Steps:

1. Go to [business.facebook.com](https://business.facebook.com/)
2. If you don't have a Business Portfolio yet, create one:
   - Click **Create Account** / **Create Business Portfolio**
   - Enter your business name, your name, and business email
3. Navigate to **Settings** (gear icon, bottom-left) → **Security Center**
4. Click **Start Verification**
5. Fill in your legal business details:
   - **Legal business name** (must match your documents exactly)
   - **Business address**
   - **Business phone number**
6. Upload documents:

   | Document Type | Examples |
   |---|---|
   | **Proof of Business Identity** (pick one) | Business License, Tax Registration Certificate (GST/VAT/EIN), Certificate of Incorporation |
   | **Proof of Address** (pick one) | Recent utility bill, bank statement (< 3 months old), lease agreement |

7. Submit and wait — verification typically takes **2–7 business days**
8. You'll get an email when it's approved

### Link Your App to Your Business Portfolio

If your app isn't already linked:
1. Back in **developers.facebook.com** → your App Dashboard
2. Go to **Settings → Basic**
3. Under **Business Portfolio**, select your verified business
4. Save

> [!TIP]
> Use a professional email on a domain you own (e.g., `you@influenceiq.com`). Gmail/Yahoo addresses can slow down verification.

---

## PART 5 — Prepare for Submission

### 5.1 — Make Successful API Calls

Before submitting, you **must have made at least one successful API call** for each permission you're requesting. Since you're still in Development Mode, do this with your test Instagram account:

| Permission | How to trigger it |
|---|---|
| `instagram_business_basic` | Complete the `/connect` → `/callback` OAuth flow (fetches profile + media) |
| `instagram_business_manage_insights` | Click **Sync** on the Dashboard (calls `/instagram/insights/sync`) |
| `instagram_business_manage_comments` | Any media fetch that includes comment counts, or trigger the sentiment batch job |
| `instagram_business_manage_messages` | ⚠️ Only if you're keeping this permission (see note below) |

> [!IMPORTANT]
> **Should you keep `instagram_business_manage_messages`?**
>
> Looking at your [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py#L12-L17), you request 4 scopes. But `instagram_business_manage_messages` is the **hardest to get approved** — it requires webhook setup and a real messaging use case. If you only use it for the `shares` metric (DM share count), that metric is already available via `instagram_business_manage_insights`. **Removing this permission dramatically improves your approval odds.** Only keep it if your app actually reads/sends DMs.

### 5.2 — Create Test Credentials for Reviewers

Meta's reviewers need to log into your app and test it themselves:

1. **Register** a new user in your app:
   - Email: `reviewer@yourdomain.com`
   - Password: `MetaReview2026!`  (something strong but simple to type)
2. Log in as that user → **Connect** a test Instagram Business/Creator account
3. Click **Sync** to pull real data so the dashboard has live charts
4. Verify the entire flow works in an **incognito browser**

> [!WARNING]
> The test account must be a **non-admin** user. If it has developer/admin roles on your Meta App, reviewers will reject it because they can't verify the experience a normal user would have.

### 5.3 — Deploy Your App Publicly

Reviewers need to reach your app over the internet:

- **Frontend**: deployed on a public HTTPS URL (e.g., `https://app.influenceiq.com`)
- **Backend**: accessible from the frontend (same domain via reverse proxy, or separate with CORS configured)
- **OAuth Redirect URI**: must match the deployed URL, not `localhost`

Update your `.env` files:
```
# backend/.env
META_REDIRECT_URI=https://your-domain.com/auth/instagram/callback
FRONTEND_URL=https://your-domain.com
```

---

## PART 6 — Submit for App Review

### 6.1 — Navigate to App Review

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → open your app
2. Left sidebar → **Instagram → API setup with Instagram Login**
3. Scroll to the **"Complete app review"** section
4. Click the edit/chevron icon
5. You'll be taken to **App Review → Requests**

### 6.2 — Select Permissions to Request

Click **Add Permissions** and select each one you need:

- ✅ `instagram_business_basic`
- ✅ `instagram_business_manage_insights`
- ✅ `instagram_business_manage_comments`
- ❓ `instagram_business_manage_messages` (only if justified — see 5.1 note)

### 6.3 — Write Use Case Descriptions

Click **Edit** next to each permission. You need to clearly explain **why** your app needs it. Here are ready-to-use descriptions:

---

#### `instagram_business_basic`

> InfluenceIQ is an analytics dashboard for Instagram content creators. We use `instagram_business_basic` to retrieve the user's Instagram profile information (username, display name, biography, profile picture URL, followers count, follows count, and media count) displayed on the dashboard header and profile sidebar. We also retrieve the user's complete media feed (posts, reels, carousels) including thumbnails, captions, timestamps, like counts, and comment counts. All data is stored in our database for long-term historical tracking beyond Instagram's native 90-day retention window, enabling creators to monitor their growth trajectory over months and years.

---

#### `instagram_business_manage_insights`

> InfluenceIQ uses `instagram_business_manage_insights` to power the core analytics experience. We fetch account-level insights (daily reach, views, total interactions, follows/unfollows, engagement rates) and per-media insights (likes, comments, saves, shares, reach, views per individual post). This data drives: (1) the Dashboard KPI cards showing Followers, Engagement Rate, Reach, and Views with trend sparklines, (2) the Engagement Overview chart plotting views/reach/interactions over time, (3) the Follower Growth chart showing net follows per day, (4) Audience Demographics with age and gender breakdowns, (5) the Content Lab analyzing performance by content type, (6) the Reels Studio showing reels-specific metrics like average watch time and skip rate, and (7) period-over-period comparisons. All insights are retained permanently in our database, enabling historical analysis that Instagram's native 90-day window does not support.

---

#### `instagram_business_manage_comments`

> InfluenceIQ uses `instagram_business_manage_comments` to read comments on the user's media posts for two purposes: (1) displaying accurate comment counts as part of per-post performance analytics in the Content Lab and Top Posts sections, and (2) feeding comments through our AI-powered sentiment analysis pipeline which categorizes audience sentiment (positive, negative, neutral) and identifies recurring discussion topics across the creator's content. This helps creators understand not just engagement volume, but the qualitative nature of their audience's reactions. Comment data is processed in automated batches and the aggregated results are displayed in the dashboard. We do not modify, delete, or post comments — access is strictly read-only.

---

#### `instagram_business_manage_messages` (only if keeping it)

> InfluenceIQ uses `instagram_business_manage_messages` in a strictly read-only capacity to access the "sends" (DM shares) engagement metric. Instagram's algorithm weights DM shares as one of the strongest engagement signals. Our platform factors this metric into a custom engagement scoring model that helps creators identify which content formats drive the deepest audience intent. We do not read, send, or manage any message content — we only access the aggregate share count per media item.

---

### 6.4 — Record Your Screencast

The screencast is the **most important** part. Reviewers often rely entirely on it.

**Requirements:**

| Rule | Detail |
|---|---|
| Format | MP4 or MOV, under 2GB |
| Length | 3–8 minutes total (can combine all permissions in one video) |
| Narration | Speak or use text overlays explaining each step |
| Data | Must show **real Instagram data** — never mock/placeholder data |
| Consistency | The app in the video must be the **exact same deployed version** reviewers will access |

**Recommended script:**

```
TIMESTAMP   WHAT TO SHOW                                          PERMISSION DEMONSTRATED
─────────   ──────────────────────────────────────────────────    ──────────────────────────
0:00-0:30   Introduce: "This is InfluenceIQ, an analytics        (intro)
            dashboard for Instagram creators..."

0:30-1:00   Open the app → show the Login page → log in           (app functionality)

1:00-1:45   Redirected to Connect page → click "Connect           instagram_business_basic
            Instagram" → Instagram OAuth dialog appears →
            authorize → callback redirects to Dashboard

1:45-2:30   Dashboard loads → point out profile info               instagram_business_basic
            (name, username, followers count in the header)
            → scroll to Top Posts showing media thumbnails

2:30-3:30   Point out KPI cards (Followers, Engagement,            instagram_business_manage_insights
            Reach, Views) → show sparkline trends →
            explain "these numbers come from the Insights API"

3:30-4:30   Show Engagement Overview chart → Follower              instagram_business_manage_insights
            Growth chart → Audience Age donut →
            Gender Split bar

4:30-5:15   Click on a post → Post Insights Drawer opens →        instagram_business_manage_insights
            show per-media metrics (likes, saves, shares,
            reach, views)

5:15-6:00   Navigate to Content Lab → show content-type            instagram_business_manage_insights
            breakdown → Navigate to Reels Studio → show
            reels-specific analytics (watch time, skip rate)

6:00-6:45   Show comment counts on posts → show Comment            instagram_business_manage_comments
            Sentiment section (if visible) → explain
            "we read comments for sentiment analysis"

6:45-7:15   Click Sync button → data refreshes → show             (all permissions)
            updated numbers

7:15-7:45   Wrap up: "InfluenceIQ stores this data                (conclusion)
            long-term, beyond Instagram's 90-day limit,
            enabling historical trend analysis..."
```

> [!TIP]
> Use a screen recorder like OBS Studio (free) or Loom. Record at 1080p minimum. Speak clearly and slowly — assume the reviewer has never seen your app.

### 6.5 — Provide Test Credentials

On the submission form, fill in:

| Field | Value |
|---|---|
| **Login URL** | `https://your-domain.com/login` |
| **Test Username** | `reviewer@yourdomain.com` |
| **Test Password** | `MetaReview2026!` |
| **Special Instructions** | *After login, click "Dashboard" in the sidebar to see analytics. All data is live from a real Instagram Business account.* |

### 6.6 — Submit! 🚀

Review everything one more time, then click **Submit for Review**.

---

## PART 7 — After Submission

### Timeline

| Stage | Typical Duration |
|---|---|
| Initial review | 2–7 business days |
| Complex cases | Up to 15 business days |
| Resubmission after feedback | 2–5 business days |

### Possible Outcomes

| Outcome | What to do |
|---|---|
| ✅ **Approved** | Your app gets **Advanced Access**. Any Instagram Business/Creator account can now connect. You're live! |
| ⚠️ **Needs Info** | Reviewer asks for clarification or a new screencast. Fix the **exact issue** they mention — don't change anything else — and resubmit. |
| ❌ **Rejected** | Read the feedback carefully. Most common fixes: better screencast, fix broken policy URLs, remove unnecessary permissions. Fix and resubmit. |

### After Approval — Switch to Live Mode

Once approved:
1. App Dashboard → top of the page, you'll see a toggle: **"In Development" → "Live"**
2. Switch to **Live**
3. Your app is now publicly available

### Annual Data Use Checkup

Meta requires an **annual Data Use Checkup** to keep your Advanced Access. You'll get an email reminder. You need to confirm:
- You still use each approved permission
- Your data handling still complies with Meta's policies
- Your Privacy Policy is up to date

**Set a calendar reminder** for this.

---

## Pre-Submission Checklist

Go through this list before hitting Submit:

```
PART 2 — App Configuration
  [ ] Instagram Login product added to your app
  [ ] OAuth Redirect URIs configured (must match META_REDIRECT_URI)
  [ ] Instagram tester added and invitation accepted

PART 3 — Prerequisites
  [ ] Privacy Policy page — live, HTTPS, tested in incognito
  [ ] Terms of Service page — live, HTTPS, tested in incognito
  [ ] Data Deletion URL — configured in Settings → Basic
  [ ] App Icon — 1024×1024, uploaded in Settings → Basic
  [ ] App Description — filled in Settings → Basic
  [ ] App Domains — your production domain listed

PART 4 — Business Verification
  [ ] Business Portfolio created at business.facebook.com
  [ ] Business Verification completed (documents uploaded, approved)
  [ ] App linked to verified Business Portfolio

PART 5 — Preparation
  [ ] At least one successful API call per requested permission
  [ ] Test user account created (non-admin, with connected IG account + synced data)
  [ ] App deployed to public HTTPS URL
  [ ] OAuth redirect URI updated to production URL
  [ ] Full flow tested in incognito browser

PART 6 — Submission
  [ ] Permissions selected in App Review → Requests
  [ ] Use case descriptions written for each permission
  [ ] Screencast recorded (real data, narrated, 1080p+)
  [ ] Test credentials filled in and working
  [ ] Removed any unnecessary permissions (especially instagram_business_manage_messages)
```

---

## Common Rejection Reasons (Avoid These!)

| # | Mistake | Fix |
|---|---|---|
| 1 | **Privacy Policy URL returns 404** | Test in incognito before submitting |
| 2 | **Requesting permissions you don't use** | Remove any scope not demonstrated in your screencast |
| 3 | **Screencast shows mock/fake data** | Use a real connected Instagram account with real posts |
| 4 | **Test credentials don't work** | Triple-check in a fresh incognito session |
| 5 | **Vague use case text** | Be specific: "We use X to display Y on screen Z" |
| 6 | **Video recorded on localhost, submission points to production** | Record on the exact same deployed URL |
| 7 | **No Data Deletion mechanism configured** | This is mandatory, not optional |
| 8 | **No successful API calls before submitting** | Make at least one call per permission first |
| 9 | **Test account has admin/developer role** | Create a fresh non-privileged user |
| 10 | **Business not verified** | Complete Part 4 before submitting |

---

## Your App's Permission Map

Quick reference: which permissions power which features in InfluenceIQ.

From [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py#L12-L17):

```
instagram_business_basic
  └── Profile (name, bio, picture, followers_count)
  └── Media feed (thumbnails, captions, timestamps)
  └── Top Posts grid
  └── Media thumbnail proxy

instagram_business_manage_insights
  └── Dashboard KPI cards (Reach, Views, Engagement, Followers)
  └── Engagement Overview chart
  └── Follower Growth chart
  └── Audience Demographics (age, gender)
  └── Content Lab (content-type analysis)
  └── Reels Studio (watch time, skip rate)
  └── Per-post insights drawer
  └── Period-over-period comparisons
  └── AI Copilot (digest, diagnostic — uses insights as input)

instagram_business_manage_comments
  └── Comment counts on media
  └── Sentiment analysis (Tier 2 batch job)
  └── Topic clustering (Tier 2 batch job)

instagram_business_manage_messages  ← CONSIDER REMOVING
  └── DM share counts ("sends" metric)
  └── Custom engagement scoring weight
```

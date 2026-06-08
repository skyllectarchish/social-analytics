# Frequently Asked Questions

---

## Getting Connected

**Do I need a YouTube channel to use these features?**
Yes. You need to connect a YouTube channel via Google OAuth before any YouTube features become available. The channel must be your own (you need to be the owner or manager).

**Can I connect a channel I don't own?**
No — YouTube's API only gives analytics access to channels you're authenticated as the owner of. You can track competitor channels in Outlier Radar, but only your own channel's analytics are available.

**Does my YouTube channel need to be monetized?**
No. All the core features work for any YouTube channel, monetized or not. The revenue estimate in Predictive Studio uses a default RPM — if your channel isn't monetized, just ignore the revenue numbers.

**I connected my Google account but nothing showed up. What happened?**
Make sure the Google account you used owns the YouTube channel you want to analyze. If you manage a channel through YouTube Studio as a brand account or content manager (not the owner), the API may not return data for it. Try signing in with the account that appears as the channel owner in YouTube Studio settings.

---

## Data and Syncing

**How often does my data update?**
Automatically once per day. You can also trigger a manual sync anytime with the **Sync** button.

**Why does my data seem to lag a day or two behind?**
YouTube's Analytics API has an inherent 1–2 day delay for most metrics. This is YouTube's limitation, not InfluenceIQ's. Your view counts from today will typically appear in the data tomorrow.

**Can I see data from before I connected InfluenceIQ?**
Yes! The initial sync pulls 12 months of historical daily analytics. So even if you connected today, you'll see a full year of views, watch time, and subscriber data.

**Why are some of my old videos missing from Retention Studio?**
Retention curve data (the actual viewer drop-off graph) is pulled on-demand when you click a video in Retention Studio. Videos with fewer than 1,000 views won't have retention data — it requires a minimum sample size to be statistically meaningful.

---

## Retention Studio

**Why does it say "Analyzing with AI — check back in a moment"?**
The AI is reading your video's transcript and generating explanations for each drop-off point. This takes about 30–60 seconds the first time you load a video. Refresh the page after a minute.

**My video has 5,000 views but still says "No retention data."**
Check that the video is at least a few days old. Retention data sometimes takes 24–48 hours to become available in YouTube's Analytics API after a video reaches the view threshold.

**The AI explanation doesn't match what I remember saying at that timestamp. Is it wrong?**
The AI reads your transcript, which comes from either your uploaded captions or YouTube's auto-generated captions. Auto-generated captions can have errors, especially for technical terms, names, or accented speech. If the explanation seems off, it may be misreading the transcript at that moment. Uploading accurate manual captions will improve the analysis.

**Can I compare retention curves across multiple videos?**
Not yet — currently you can only view one video at a time. Side-by-side curve comparison is on the roadmap.

---

## Outlier Radar

**How many competitors can I track?**
Up to 5 channels on a standard account.

**How do I find a competitor's @handle?**
Go to their YouTube channel page. Their @handle is shown under their channel name at the top (e.g., @mkbhd). You can also paste their full channel URL.

**A competitor posted a viral video but I didn't get an alert. Why?**
Two possible reasons:
1. If InfluenceIQ is running in polling mode (no webhook), it checks once a day. If the video was posted and went viral within the same day as the last check, you'll see it in the next daily update.
2. The video may not have crossed the outlier threshold (3× baseline) yet. A video that's doing well but not dramatically above average won't trigger an alert.

**What does "3× average" mean exactly?**
It means the video got 3 times more views in its first 24 hours than that channel's typical new video. If the channel normally gets 10,000 views in 24 hours and this video got 30,000+, it's flagged as an outlier.

---

## Predictive Studio

**My video has a prediction but the range is really wide — like 5,000 to 50,000. Is that useful?**
A wide range means the model is less certain, usually because:
- Your channel doesn't have many older videos with velocity data (the model needs training data)
- Your content type or performance varies a lot from video to video

As you publish more videos over time, the prediction range will narrow. Even a wide range is useful as a rough directional signal — "probably somewhere in this range" is still better than no signal at all.

**Why does "Predictive Studio" only show videos from the last 30 days?**
Predictions are only meaningful for videos that are still being actively promoted by the algorithm. A video from 8 months ago already has a settled performance curve — there's nothing to predict.

**My channel is brand new. Will predictions work?**
Not immediately. The model needs at least 5 older videos (30+ days old) with velocity data to start generating predictions. Until then, it uses a rough fallback multiplier and will show low confidence. Keep posting — the model improves as your library grows.

---

## Archive Miner

**How old does a video need to be to appear in Archive Miner suggestions?**
At least 1 year old. Archive Miner specifically targets older content because the goal is to resurface forgotten videos, not to suggest you remake something you posted last month.

**I ran a scan and got zero suggestions. Does that mean I have no revival opportunities?**
Not necessarily. It means that right now, none of your old video topics have a strong enough trend signal. Archive Miner only surfaces real opportunities — if your old videos cover topics that aren't currently trending anywhere, it won't invent suggestions. Check back weekly; trends change.

**Can I run a scan more than once a day?**
No — once per day via the manual "Run Scan Now" button. The automatic weekly scan also runs every Sunday night.

**Why does Archive Miner sometimes suggest a different title than my original?**
The AI often suggests a title that incorporates the trending keyword even if your original title didn't use that exact phrasing. It's not saying your original title was wrong — it's adapting to current search demand. Use the suggestion as a starting point, not a directive.

---

## Cross-Platform ROI

**What does a 74% correlation actually mean?**
It means there's a fairly strong statistical relationship between your Instagram Reel posting days and your YouTube subscriber gains. Days with Reel posts tend to have higher subscriber gains than days without. It doesn't guarantee causation — there could be other explanations — but it's a meaningful signal worth paying attention to.

**My correlation score is very low (under 20%). What does that mean?**
It likely means your Instagram and YouTube audiences are mostly different people right now. That's okay — it just means your cross-promotion isn't converting as much as it could. Try being more explicit in your Reels about pointing viewers to YouTube, and see if the correlation improves over the next few months.

**Instagram isn't connected. Can I still use Cross-Platform?**
The page will load, but without Instagram data you'll only see the YouTube subscriber chart — the Reel markers won't appear, and no correlation score will be calculated. Connect Instagram to get the full picture.

---

## Smart Alerts

**I published a video but didn't get a Golden Hour alert. Why?**
Golden Hour alerts require webhooks to be active. If you're running InfluenceIQ locally without a public URL, the alert won't fire in real time. See your admin about setting up `WEBHOOK_BASE_URL` with ngrok or a deployed server. Alternatively, you can check Predictive Studio manually about an hour after publishing.

**My Preflight Check said my title score was 62/100. Do I have to change it?**
No — it's a suggestion, not a requirement. The AI's feedback is meant to be helpful, not prescriptive. Read the reasoning and decide for yourself whether the suggested changes align with your style and what you know about your audience. You know your channel better than the AI does.

**Where do I see my past alerts?**
All alerts are saved in the Alerts section accessible from the header of the YouTube pages. They don't expire.

---

## Setting Up Webhooks

**What are webhooks and why do they matter?**
Webhooks are how YouTube notifies InfluenceIQ in real time when something happens on your channel (or a competitor's). Without webhooks, InfluenceIQ has to check YouTube's API on a schedule instead of being told instantly.

Webhooks enable:
- Golden Hour alerts (needs to know exactly when you publish)
- Preflight title checks (same reason)
- Near-instant competitor outlier detection
- Competitor title change tracking

**How do I set up webhooks for local development?**
Use [ngrok](https://ngrok.com) to create a public URL that tunnels to your local backend:

```bash
ngrok http 8000
```

Copy the generated URL (like `https://abc123.ngrok.io`) and set it in your `.env`:

```
WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

Restart the backend. Webhooks will now be active.

**Note:** In YouTube's testing mode (which you'll be in during local development), refresh tokens expire every 7 days. You'll need to re-authenticate your YouTube channel weekly.

**Do webhooks work in production?**
Yes — once you deploy InfluenceIQ on a server with a real public URL, set `WEBHOOK_BASE_URL` to that URL and all webhook features become permanently active.

---

## Privacy and Data

**Does InfluenceIQ store my video content?**
No. InfluenceIQ only stores analytics data (view counts, retention curves, etc.) and metadata (titles, thumbnails, publish dates). Your actual video files never touch InfluenceIQ's servers.

**Does InfluenceIQ access my Gmail or other Google services?**
No. The Google OAuth scopes requested are strictly limited to YouTube channel data, YouTube analytics, and caption download for retention analysis. No access to Gmail, Drive, or any other Google services.

**What happens to my data if I disconnect?**
Disconnecting your YouTube channel removes all stored analytics from InfluenceIQ's database. Your data is not retained after disconnection.

---

> **Back to:** [README →](../README.md)

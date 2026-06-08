# Predictive Studio

Predictive Studio forecasts how your newly published videos will perform over the next 30 days — using the first 4 hours of data as the signal.

---

## The Core Idea

The first few hours after a video goes live are extremely telling. YouTube's algorithm decides quickly whether to push a video or let it sit. By tracking how fast views accumulate in the first 4 hours — what's called "velocity" — InfluenceIQ can predict roughly how the video will perform over the next month.

It's not magic — it's pattern recognition trained on *your channel's own history*. Every creator's audience behaves differently, so predictions are specific to you.

---

## How to Use It

1. Go to **Predictive Studio** in the sidebar.
2. You'll see your recent videos (last 30 days) in the left panel. Click one to load its data.
3. The right panel shows two things:
   - **Velocity chart** — hourly views in the first 4 hours, then daily views after
   - **30-Day Projection** — the predicted view count and estimated revenue

---

## The Velocity Chart

This is a bar chart showing how many views your video got at each checkpoint:

- **+1 hour** — very early signal
- **+2 hours** — trending up or flattening out?
- **+3 hours** — algorithm interest becoming clear
- **+4 hours** — the key data point used for prediction

After the 4-hour window, the chart continues as a daily line showing ongoing performance.

A steep velocity curve in the first 4 hours usually means YouTube's algorithm picked up the video and started recommending it. A flat curve means it's being shown to fewer people — which isn't always bad (some videos grow slowly through search).

---

## The 30-Day Projection

Below the velocity chart, you'll see a prediction card with two boxes:

**Predicted Views**
A range like "9,300 – 15,500" with a central estimate like "12,400." The range represents the confidence interval — the wider the range, the more uncertain the prediction.

**Estimated Revenue**
A revenue estimate like "$37 – $47." This uses a default RPM (revenue per 1,000 views) of $3.00, which is a conservative estimate for mid-tier channels. Revenue is an estimate only and depends heavily on your actual RPM, advertiser demand, and many other factors.

**Model Accuracy**
A percentage like "Model accuracy: 78% R²." This tells you how well InfluenceIQ's prediction model has performed on your past videos. Higher is better. A brand new channel with few videos will show lower accuracy — it improves as you publish more content.

---

## How the Prediction Is Built

InfluenceIQ builds a prediction model that's unique to *your channel*. It works like this:

1. It looks at all your older videos (30+ days old) where it has both the 4-hour velocity data and the actual 30-day view count.
2. It finds the relationship between "fast start" and "long-term success" on your specific channel.
3. It applies that pattern to your new video's early velocity.

For example: if your channel's data shows that videos with 500+ views in the first 4 hours almost always reach 50,000+ by day 30, then a new video hitting 600 views in hour 4 will get a strong projection.

**If you're a new creator or just connected recently**, the model won't have enough history to make accurate predictions yet. It'll use a rough fallback estimate and clearly show "Insufficient data" in the accuracy metric. The more you publish and the more videos InfluenceIQ tracks, the better your predictions get.

---

## "No Prediction Yet" State

If you select a video and see "No prediction yet — velocity data needed first," it means:

- The video was published very recently and the 4-hour tracking window hasn't finished yet, OR
- The video was published before you connected InfluenceIQ, so no velocity data was captured

In the second case, the video will still appear in your library but won't get a projection.

---

## What This Is Good For

**Managing your expectations after publishing.** Instead of obsessively checking views every 10 minutes, you can wait for the 4-hour checkpoint and get a data-backed sense of where the video is heading. If it's looking strong, great — engage with comments to boost it further. If it's looking weak, consider whether to update the title or thumbnail early.

**Comparing launches.** Over time, you'll see which types of videos get strong early velocity (and therefore strong projections) vs. which ones start slow. That tells you what your audience responds to immediately vs. what grows through search over time.

**Revenue planning.** The revenue estimate isn't going to be exact, but it gives you a ballpark for planning. If you're negotiating a brand deal, knowing your typical video earns in the $40–$80 range helps you set expectations.

---

## Important Caveats

- **Predictions are based on historical patterns.** If YouTube changes its algorithm, or if you try a completely new content format, the prediction may be less accurate while the model catches up.
- **Revenue estimates are rough.** Actual RPM varies wildly by niche, season, advertiser demand, and video topic. The $3.00 default is conservative — tech and finance channels often earn 3–5× that.
- **This is a forecast, not a guarantee.** A strong 4-hour start can still fizzle if the video gets buried in algorithm changes, or take off later than expected if it picks up search traffic.

---

> **Next up:** [Archive Miner →](05-archive-miner.md) — find old videos worth remaking or turning into Shorts

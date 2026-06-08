# Outlier Radar

Outlier Radar lets you track competitor YouTube channels and get an AI-powered breakdown whenever one of their videos goes viral — so you can understand *why* it worked and apply those lessons to your own content.

---

## What Is an "Outlier"?

An outlier is a video that performs dramatically better than the creator's normal baseline. If a channel usually gets 10,000 views on a new video but suddenly posts one that hits 80,000 — that's an outlier. Something about that video broke through in a way their typical uploads don't.

Outlier Radar watches for exactly this on the channels you track, and alerts you the moment it detects one.

---

## Adding a Competitor

1. Go to **Outlier Radar** in the sidebar.
2. In the "Add Competitor Channel" box at the top, enter a YouTube `@handle` or channel URL (e.g., `@mkbhd` or `youtube.com/@mkbhd`).
3. Click **Add**.
4. InfluenceIQ will confirm the channel name and thumbnail so you know you got the right one.

You can track up to **5 competitor channels** on a standard account. The list appears on the left side of the page.

> **Tip:** Track channels that are about 1–3 steps ahead of you in size. A tiny creator tracking a channel with 5 million subscribers won't get as much actionable insight as tracking someone 2x their own size.

---

## The Outlier Feed

The right side of the page shows every outlier video detected across your tracked competitors, sorted from newest to oldest.

Each card shows:

**Thumbnail + Title**
The video that went viral.

**View count with multiplier**
How many times above the channel's normal performance this video hit. "5.2× average" means this video got 5x more views than their typical new upload.

**Publish date**
When the video went live.

**"Why it worked" — AI Analysis**
This is the part that makes Outlier Radar genuinely useful. The AI looks at the video's title, topic, and performance data and gives you a 2-3 sentence breakdown:

> *"This video hit 5x the channel's average because the title format — a direct challenge ('You're Doing X Wrong') — creates high curiosity without being clickbait. The topic (a common mistake in a popular niche) has broad search intent, and the thumbnail uses a strong reaction face. Consider adapting this title formula to a pain point in your niche."*

That's not something YouTube Studio can give you.

---

## Title History — Catching A/B Tests

Below each outlier card, there's a "Show title history" button. When you expand it, you'll see every title the creator used for that video, with timestamps.

This is powerful because many creators A/B test titles after publishing — they post with one title, then change it a few hours later if the CTR isn't great. Seeing the full history tells you what title they *landed on* after testing, which is often the most optimized version.

If a creator changed their title 3 times in 48 hours, they were experimenting. The final title is the winner.

---

## Live vs Polling Mode

You'll notice some channels show a green **● Live** badge. This means InfluenceIQ is subscribed to that channel's feed via YouTube's webhook system — new videos are detected within minutes of publishing.

Channels without the Live badge are checked once per day instead. Detection is just a bit slower (up to 24 hours), but you still get the outlier alert and AI analysis.

Whether a channel shows Live depends on how your InfluenceIQ instance is configured. If you're running locally without a public URL (ngrok), channels will use the daily polling mode. On a deployed server with `WEBHOOK_BASE_URL` set, all channels go Live automatically when you add them.

---

## How the AI Figures Out "Why It Worked"

Once a video is detected as an outlier (3× or more above baseline at the 24-hour mark), the AI gets to work:

1. It looks at the video's title and topic
2. It compares the view count to the last 30 videos from that channel to establish the baseline
3. It reasons about what's different — title format, topic novelty, thumbnail style, hook structure
4. It writes a plain-English explanation you can act on

The analysis is opinionated by design. It gives you a specific recommendation, not a vague "this video performed well because it resonated with viewers" non-answer.

---

## What to Do With This Information

- **Spot topic trends early.** If a competitor's video about a specific topic went 5× normal, that topic is hot right now in your niche. Can you make your own angle on it?

- **Study title formulas.** The AI often calls out the specific title structure that drove curiosity. Try adapting it to your own content.

- **Track the title A/B test history.** If the same creator keeps changing titles on their viral videos, they've learned something about what CTR formula works in your niche. Learn from their experiments.

- **Know when NOT to copy.** Sometimes a video goes viral because of the creator's personal story or a one-time trend. The AI will usually call this out — "this worked because of a personal narrative that doesn't translate to other channels."

---

> **Next up:** [Predictive Studio →](04-predictive-studio.md) — forecast how your newest video will perform

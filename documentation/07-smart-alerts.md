# Smart Alerts

Smart Alerts are InfluenceIQ's proactive notifications — things you'd want to know about your channel as soon as they happen, without having to go looking for them.

There are three types of alerts:

1. **Golden Hour Alert** — how your new video is performing 60 minutes after publishing
2. **Preflight Check** — an AI review of your video title the moment you publish
3. **Competitor Update Alerts** — when a tracked competitor's video changes title (caught in Outlier Radar)

---

## Golden Hour Alert

### What Is the "Golden Hour"?

The first hour after a video goes live is one of the most critical moments in its lifecycle. YouTube's algorithm is watching closely: if early viewers click and watch, it interprets that as a signal to show the video to more people. If early viewers scroll past or click off quickly, the algorithm backs off.

### What the Alert Shows

One hour after you publish a new video, InfluenceIQ automatically checks the view count and compares it to your channel's baseline (the average first-hour performance across your other recent videos).

You'll get an alert in the **Alerts** section telling you one of two things:

**If your video is underperforming:**
> *"Your video has 42 views after 1 hour — 38% of your typical baseline. Consider updating the title or thumbnail now while the video is still fresh."*

This is actionable. The first hour is one of the few moments where changing a title or thumbnail can meaningfully affect performance — because the algorithm hasn't made up its mind yet.

**If your video is overperforming:**
> *"Your video has 1,840 views after 1 hour — 2.4× your typical baseline! Jump into the comments now to boost engagement while it's trending."*

When a video is outperforming early, engaging in the comments in the first few hours signals to YouTube that the creator is active, which can further boost the video's reach.

### How to Act on It

- **Underperforming?** Open YouTube Studio and try a different thumbnail. If the title is weak, update it to be more specific or add a curiosity hook. You have the most leverage within the first 2–3 hours.
- **Overperforming?** Reply to early comments. Pin a question. Share the link in your community posts or Instagram stories to add fuel to the fire.

---

## Preflight Check (AI Title Review)

### What It Does

The moment you publish a new video on YouTube, InfluenceIQ receives a notification (via YouTube's webhook system) and immediately runs your title through an AI analysis. If the title scores below 80/100 on CTR best practices, you'll get a Preflight alert.

### What It Checks

The AI evaluates your title against these factors:

- **Length** — is it too long for mobile? (Over 60 characters often gets cut off in YouTube's mobile app)
- **Hook** — does it create curiosity or promise a specific benefit? Titles that tell viewers *exactly* what they'll get tend to outperform vague ones.
- **Keyword clarity** — can someone tell from the title alone what the video is about and why they should watch?
- **Emotional pull** — does it evoke any emotion or urgency, or is it flat?

### What a Preflight Alert Looks Like

> *"AI Title Review — Score: 62/100*
> *Issues: Title is 71 characters (may be cut off on mobile). No curiosity gap or specific benefit stated.*
> *Suggestions: Shorten to under 60 characters. Add a specific outcome, e.g., 'How I 10× My Views in 30 Days (Without More Uploads)' instead of the current generic framing."*

You'll only get this alert if the title scores below 80 — high-scoring titles don't generate alerts. No news is good news.

### What to Do With It

The alert comes in within a minute or two of publishing. You can still go to YouTube Studio and update your title — YouTube won't penalize you for changing a title early, and a stronger title in the first few hours can significantly improve your CTR.

---

## Viewing Your Alerts

All alerts are accessible via the **Alerts** tab (available in the header of the YouTube section). They're sorted by most recent and show the video thumbnail, alert type, and message.

Alerts don't expire — you can review past Golden Hour and Preflight alerts to spot patterns over time: Are your titles consistently flagged for the same issues? Is your baseline first-hour performance growing or shrinking?

---

## How Alerts Are Triggered

Alerts only work in **webhook mode** — when InfluenceIQ is running on a server with a public URL and has subscribed to your YouTube channel's feed.

If you're running InfluenceIQ locally without ngrok or a public server URL, alerts won't fire because YouTube can't send a notification to `localhost:8000`. See the [Setup Guide](08-faqs.md#setting-up-webhooks) for how to enable this.

If webhooks aren't set up, the Golden Hour check still runs — it's just triggered by the daily sync instead of a real-time notification, so you'd see the alert the next morning rather than an hour after publishing.

---

## Competitor Title Change Alerts

This one is surfaced inside Outlier Radar rather than the main Alerts feed. When a competitor you're tracking changes the title of a recently published video, the title history shows up automatically in that video's card in the Outlier Radar feed.

This is useful for catching A/B title testing — some creators change their titles 2–3 times in the first 48 hours trying to find the version that gets the best CTR. The version they end up sticking with is their winner, and it's worth understanding why.

---

> **Next up:** [FAQs →](08-faqs.md) — common questions answered

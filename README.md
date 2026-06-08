# InfluenceIQ — Your All-In-One Creator Analytics Dashboard

Instagram + YouTube analytics in one place. Understand your audience, spot what's working, and grow smarter.

---

## YouTube Documentation for Creators

New to the YouTube features? Start here:

| Guide | What it covers |
|---|---|
| [Getting Started](documentation/00-getting-started.md) | Connecting your channel, first sync, what to expect |
| [Overview Dashboard](documentation/01-overview-dashboard.md) | Your views, watch time, and subscriber stats at a glance |
| [Retention Studio](documentation/02-retention-studio.md) | Find out *why* viewers leave your videos — with AI explanations |
| [Outlier Radar](documentation/03-outlier-radar.md) | Track competitors and get alerts when their videos go viral |
| [Predictive Studio](documentation/04-predictive-studio.md) | Forecast how your new video will perform in 30 days |
| [Archive Miner](documentation/05-archive-miner.md) | Discover old videos worth remaking or turning into Shorts |
| [Cross-Platform ROI](documentation/06-cross-platform.md) | See if your Instagram Reels bring in YouTube subscribers |
| [Smart Alerts](documentation/07-smart-alerts.md) | Golden Hour velocity alerts + AI title quality checker |
| [FAQs](documentation/08-faqs.md) | Common questions answered |

---

## Quick Setup

### Start the backend
```bash
cd backend
cp .env.example .env   # add your ClickHouse, Google, and Meta credentials
python run_migrations.py
uvicorn app.main:app --reload
```

### Start the frontend
```bash
cd frontend
npm install
npm run dev   # opens at https://localhost:5173
```

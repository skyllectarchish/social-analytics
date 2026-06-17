# InfluenceIQ — Your All-In-One Creator Analytics Dashboard

Instagram + YouTube analytics in one place. Understand your audience, spot what's working, and grow smarter.

📍 **Product direction:** see the [Roadmap](ROADMAP.md).

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

---

## Technical Documentation (for developers)

A complete, code-level audit of the platform lives in [`docs/technical/`](docs/technical/). Start with the master index:

| Document | What it covers |
|---|---|
| [Project Documentation](docs/technical/PROJECT_DOCUMENTATION.md) | **Start here** — exec summary, diagrams, known issues, recommended improvements |
| [Architecture](docs/technical/ARCHITECTURE.md) | Purpose, tech stack, folder structure, request lifecycle, layering |
| [API Reference](docs/technical/API_REFERENCE.md) | Every endpoint + the page → endpoint → service → state matrix |
| [Data Flow](docs/technical/DATA_FLOW.md) | End-to-end traces and the background-job schedule |
| [Database](docs/technical/DATABASE.md) | All ClickHouse tables, ERD, engines, indexes, query patterns |
| [Auth Flow](docs/technical/AUTH_FLOW.md) | Login/JWT/session + Instagram & YouTube OAuth, with sequence diagrams |
| [Component Guide](docs/technical/COMPONENT_GUIDE.md) | Frontend component tree, pages, and state management |
| [Performance Audit](docs/technical/PERFORMANCE_AUDIT.md) | Findings, severity, and fixes |
| [Security Audit](docs/technical/SECURITY_AUDIT.md) | Findings, severity, and prioritized remediation |

# YouTube Integration Implementation Plan: The Next-Gen Features

This document outlines a fresh, cutting-edge roadmap for the YouTube integration. Instead of replicating basic native Studio features, this roadmap focuses on advanced, AI-driven intelligence (trends seen in 2025/2026) that genuinely differentiate the platform.

## Goal Description
To build a YouTube analytics suite that goes beyond "vanity metrics" and answers the *why* behind channel performance. By combining YouTube Data API v3, YouTube Analytics API v2, and the platform's existing LLM infrastructure (Anthropic/Ollama), we will offer predictive modeling, contextual benchmarking, and psychographic audience analysis.

## Value Proposition (The "Cutting-Edge" Features)

These are the advanced features we will offer creators that they cannot get in YouTube Studio:

1. **Intention-Based Retention Analysis:** We won't just show a retention graph; we will use AI to analyze the video transcript and comments around drop-off timestamps to explain *why* viewers left (e.g., "Pacing slowed down during the sponsor read," or "Hook was too long").
2. **Outlier Detection & Reverse Engineering:** Creators can track competitors. The system will alert them when a competitor posts an "outlier" (a video performing 3–10x above their average) and use AI to reverse-engineer *why* it worked (title format, thumbnail style, topic).
3. **Predictive Performance Projections:** By analyzing the first 4 hours of a video's velocity (CTR + Average View Duration) against historical data, we can predict the video's 30-day view count and revenue.
4. **The "Archive Miner" (Content Revival):** The system scans a creator's older videos (1+ years) and compares them to current trending search terms. It will suggest which old videos should be remade, updated, or clipped into Shorts.
5. **True Cross-Platform ROI (The Funnel):** Since we already have Instagram data, we can map the true audience funnel. Does an Instagram Reel drive YouTube long-form subscribers? We will build reports that track cross-platform conversion.
6. **Real-Time Webhook Intelligence:** Using YouTube's PubSubHubbub webhooks, we can instantly alert creators if their newly published video is underperforming in the "Golden Hour," or track a competitor's stealth title changes (A/B testing) in real time.

---

## ⚠️ User Review Required
Please review the proposed build phases below. This is an ambitious, AI-heavy roadmap. We need to align on whether you want to prioritize the **Competitor Outlier Detection** or the **Intention-Based Retention** first.

## ❓ Open Questions
> [!IMPORTANT]
> - For the Archive Miner, how often should we run the background job to check trends? (e.g. Weekly, Bi-weekly?)

---

## Proposed Changes (Build Roadmap)

### Phase 1: Foundation & The "Outlier" Engine
**Goal:** Establish the data pipeline and build the highly efficient, webhook-driven competitor intelligence engine.
- [NEW] `backend/app/youtube/router.py`: Implement Google OAuth 2.0 flow for YouTube access.
- [NEW] `backend/app/models/youtube_competitor.py`: Schema to track competitor channels and their velocity stats.
- [NEW] `backend/app/jobs/outlier_detection.py`: Triggered by WebSub webhooks (zero quota cost) when a competitor uploads, it schedules 4-hr/12-hr/24-hr `videos.list` polls to detect 3x-10x performance spikes.
- [NEW] `frontend/src/pages/youtube/OutlierRadarPage.tsx`: Dashboard displaying competitor outliers with AI-generated breakdowns of their titles/topics. Support for 3-5 competitor channels for Standard users, 15-25 for Premium.

### Phase 2: AI-Powered Retention & Psychographics
**Goal:** Supercharge retention graphs with AI context.
- [NEW] `backend/app/ai/retention_analyzer.py`: A new module that correlates YouTube Analytics retention drop-offs with the video's downloaded transcript to explain *why* viewers left.
- [NEW] `backend/app/jobs/sentiment_sync.py`: Syncs and clusters YouTube comments by sentiment and "purchase/action intent."
- [NEW] `frontend/src/components/youtube/SmartRetentionChart.tsx`: A retention chart overlaid with AI annotations explaining the peaks and valleys.

### Phase 3: The Archive Miner & Predictive Analytics
**Goal:** Help creators predict the future and repurpose the past.
- [NEW] `backend/app/youtube/predictive_model.py`: A linear regression (or ML-based) model predicting 30-day views based on 4-hour initial CTR and Watch Time.
- [NEW] `backend/app/jobs/archive_miner.py`: Background job that extracts topics from older videos using LLMs, then checks real-time demand using the **YouTube Autocomplete API** and broad trends using the **Wikipedia Pageviews API**.
- [NEW] `frontend/src/pages/youtube/ContentRevivalPage.tsx`: A UI suggesting which old videos the creator should remake or clip into Shorts.

### Phase 4: Real-Time Webhook Intelligence (PubSubHubbub)
**Goal:** Leverage zero-quota push notifications from YouTube for instant insights.
- [NEW] `backend/app/youtube/webhook.py`: Fast API endpoints to subscribe to and receive PubSubHubbub POST requests for channel uploads and metadata updates.
- [NEW] `backend/app/ai/preflight_check.py`: Triggered instantly on upload webhook to analyze the user's new title/thumbnail and push an alert if it violates best practices (e.g., title too long for mobile).
- [NEW] `backend/app/jobs/golden_hour.py`: Triggers exactly 60 minutes after a webhook upload notification to check initial velocity and send an actionable alert.
- [NEW] `frontend/src/components/youtube/TitleTracker.tsx`: A UI timeline showing exactly when and how competitors change their video titles after publishing.

---

## Verification Plan

### Automated Tests
- Test the `predictive_model.py` against historical (already matured) video data to verify its 30-day projection accuracy.
- Mock the `outlier_detection.py` job with artificial spikes to ensure the detection threshold (3x-10x) triggers correctly.

### Manual Verification
- Run the `retention_analyzer.py` on a known video with a sharp drop-off (e.g., a boring sponsor read) and verify if the AI correctly identifies the transcript segment as the cause.
- Have a beta tester connect their channel and ensure the "Archive Miner" suggests logically sound topics for revival.

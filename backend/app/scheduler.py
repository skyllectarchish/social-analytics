"""Tier 2 — in-process APScheduler for Tier 2 batch jobs.

The API process owns a single AsyncIOScheduler that drives the three Tier 2
background jobs on the cadence documented in the implementation plan:

* `account_sync` — daily at `SCHEDULER_ACCOUNT_SYNC_HOUR` UTC (own profile/
  media/insights refresh + long-lived token renewal).
* `competitor_sync` — daily at `SCHEDULER_COMPETITOR_SYNC_HOUR` UTC.
* `sentiment_batch` — every `SCHEDULER_SENTIMENT_BATCH_MINUTES` minutes.
* `topic_clustering` — weekly on `SCHEDULER_TOPIC_CLUSTERING_DAY` /
  `SCHEDULER_TOPIC_CLUSTERING_HOUR` UTC.

Set ENABLE_SCHEDULER=false to disable everything — useful when:
- running cron externally,
- running multiple uvicorn workers (only one should schedule),
- developing locally without the optional anthropic/scikit-learn deps installed.

Each scheduled run is wrapped in an exception barrier so a failing job does
not crash the scheduler thread. Misfires (e.g., laptop sleep) are coalesced.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .config import settings

logger = logging.getLogger(__name__)

# Singleton — created lazily on startup so importing this module does not
# require apscheduler to be installed at import time. The lifespan hook is
# the only caller of `start_scheduler()` / `shutdown_scheduler()`.
_scheduler: Any | None = None


async def _run_account_sync() -> None:
    # Async wrapper — see _run_competitor_sync for the coroutine rationale.
    from .jobs import account_sync
    try:
        await account_sync._run()
    except Exception:
        logger.exception("Scheduled account_sync failed")


async def _run_competitor_sync() -> None:
    # Async wrapper — registered as a coroutine so AsyncIOScheduler awaits it
    # on the running event loop. The sync entry point `competitor_sync.main()`
    # wraps `asyncio.run()`, which would crash inside an active event loop, so
    # we call the async `_run()` directly here.
    from .jobs import competitor_sync
    try:
        await competitor_sync._run()
    except Exception:
        logger.exception("Scheduled competitor_sync failed")


def _run_sentiment_batch() -> None:
    # Pure sync — APScheduler's AsyncIOExecutor runs sync callables in a
    # ThreadPoolExecutor, so this doesn't block the event loop.
    from .jobs import sentiment_batch
    try:
        sentiment_batch.main()
    except Exception:
        logger.exception("Scheduled sentiment_batch failed")


def _run_topic_clustering() -> None:
    # Pure sync (TF-IDF + KMeans in scikit-learn). Same thread-pool note.
    from .jobs import topic_clustering
    try:
        topic_clustering.main()
    except Exception:
        logger.exception("Scheduled topic_clustering failed")


async def _run_branded_hashtag_sync() -> None:
    # Async — same reasoning as _run_competitor_sync.
    from .jobs import branded_hashtag_sync
    try:
        await branded_hashtag_sync._run()
    except Exception:
        logger.exception("Scheduled branded_hashtag_sync failed")


async def _run_story_snapshot() -> None:
    # Async — same reasoning as _run_competitor_sync.
    from .jobs import story_snapshot
    try:
        await story_snapshot._run()
    except Exception:
        logger.exception("Scheduled story_snapshot failed")


async def _run_dm_funnel_runner() -> None:
    # Async — same reasoning as _run_competitor_sync.
    from .jobs import dm_funnel_runner
    try:
        await dm_funnel_runner._run()
    except Exception:
        logger.exception("Scheduled dm_funnel_runner failed")


async def _run_weekly_digest() -> None:
    # Tier 4 / Phase F — async because digest synthesis is async (Anthropic
    # SDK is awaited). Per-user errors are isolated inside the job; this
    # wrapper just catches truly catastrophic failures.
    if not settings.ollama_api_key:
        # Don't even attempt — the loop would discover this and skip every
        # user, but logging it here is cleaner.
        logger.info("Scheduled weekly_digest skipped — OLLAMA_API_KEY not set")
        return
    from .jobs import weekly_digest
    try:
        await weekly_digest._run()
    except Exception:
        logger.exception("Scheduled weekly_digest failed")


async def _run_yt_outlier_detection() -> None:
    """Daily competitor outlier scan — only runs when WEBHOOK_BASE_URL is not set (polling fallback)."""
    from .config import settings
    if settings.webhook_base_url:
        # Webhook mode active — skip polling fallback
        return
    from .jobs import yt_competitor_poll
    try:
        await yt_competitor_poll._run()
    except Exception:
        logger.exception("Scheduled yt_outlier_detection failed")


async def _run_yt_archive_miner() -> None:
    """Weekly archive miner — requires OLLAMA_API_KEY."""
    from .config import settings
    if not settings.ollama_api_key:
        logger.info("Scheduled yt_archive_miner skipped — OLLAMA_API_KEY not set")
        return
    from .jobs import yt_archive_miner
    try:
        await yt_archive_miner._run()
    except Exception:
        logger.exception("Scheduled yt_archive_miner failed")


def schedule_golden_hour(user_id: str, channel_id: str, video_id: str) -> None:
    """Schedule a golden hour check 60 minutes from now."""
    global _scheduler
    if _scheduler is None:
        return
    from datetime import datetime, timedelta, timezone
    from apscheduler.triggers.date import DateTrigger
    from .jobs.yt_golden_hour import run_golden_hour
    run_at = datetime.now(timezone.utc) + timedelta(minutes=60)
    job_id = f"golden_hour_{user_id}_{video_id}"
    _scheduler.add_job(
        run_golden_hour,
        DateTrigger(run_date=run_at),
        id=job_id,
        args=[user_id, channel_id, video_id],
        replace_existing=True,
        misfire_grace_time=600,
    )


def schedule_velocity_checks(user_id: str, channel_id: str, video_id: str) -> None:
    """Schedule velocity checks at +4h, +12h, +24h for a competitor video."""
    global _scheduler
    if _scheduler is None:
        return
    from datetime import datetime, timedelta, timezone
    from apscheduler.triggers.date import DateTrigger
    from .jobs.yt_outlier_detection import check_video_after_delay
    now = datetime.now(timezone.utc)
    for hours in (4, 12, 24):
        run_at = now + timedelta(hours=hours)
        job_id = f"velocity_{user_id}_{video_id}_{hours}h"
        _scheduler.add_job(
            check_video_after_delay,
            DateTrigger(run_date=run_at),
            id=job_id,
            args=[user_id, channel_id, video_id, hours],
            replace_existing=True,
            misfire_grace_time=1800,
        )


def start_scheduler() -> None:
    """Start the in-process scheduler if `ENABLE_SCHEDULER` is true.

    Idempotent: re-calling after the scheduler is running is a no-op.
    """
    global _scheduler
    if not settings.enable_scheduler:
        logger.info("Scheduler disabled via ENABLE_SCHEDULER=false")
        return
    if _scheduler is not None:
        return

    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        from apscheduler.triggers.interval import IntervalTrigger
    except ImportError:
        logger.warning(
            "apscheduler not installed — batch jobs will not run on a schedule. "
            "Install it (pip install apscheduler) or set ENABLE_SCHEDULER=false."
        )
        return

    # AsyncIOScheduler reuses the running event loop. Pin executor pool to 1
    # per job so the three jobs don't all run concurrently and clobber each
    # other's ClickHouse client (the client is a process-wide singleton).
    sch = AsyncIOScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 600},
    )

    # Own-account sync runs an hour before competitor_sync so the latter's
    # daily self-snapshot reads freshly synced profile/media data.
    sch.add_job(
        _run_account_sync,
        CronTrigger(hour=settings.scheduler_account_sync_hour, minute=0),
        id="account_sync",
        name="Daily own-account sync + token refresh",
        replace_existing=True,
    )
    sch.add_job(
        _run_competitor_sync,
        CronTrigger(hour=settings.scheduler_competitor_sync_hour, minute=0),
        id="competitor_sync",
        name="Daily competitor snapshot",
        replace_existing=True,
    )
    sch.add_job(
        _run_sentiment_batch,
        IntervalTrigger(minutes=settings.scheduler_sentiment_batch_minutes),
        id="sentiment_batch",
        name="Score pending comments",
        replace_existing=True,
        # Don't fire immediately on startup — give the API a moment to settle.
        next_run_time=None,
    )
    sch.add_job(
        _run_topic_clustering,
        CronTrigger(
            day_of_week=settings.scheduler_topic_clustering_day,
            hour=settings.scheduler_topic_clustering_hour,
            minute=0,
        ),
        id="topic_clustering",
        name="Weekly topic clustering",
        replace_existing=True,
    )

    # Branded-hashtag sync — weekly because Meta caps hashtag queries at 30
    # per IG user per rolling 7 days. We run a day after topic_clustering so
    # the two heavyweight jobs don't overlap.
    sch.add_job(
        _run_branded_hashtag_sync,
        CronTrigger(
            day_of_week=(settings.scheduler_topic_clustering_day + 1) % 7,
            hour=settings.scheduler_topic_clustering_hour,
            minute=15,
        ),
        id="branded_hashtag_sync",
        name="Weekly branded hashtag mention sync",
        replace_existing=True,
    )

    # Story analytics retention — capture live stories (and their insights)
    # before the 24h expiry. Interval-based so each story gets several
    # snapshots over its lifetime; ReplacingMergeTree keeps the freshest.
    #
    # Unlike the other interval jobs we DO fire shortly after startup: a story
    # is gone forever 24h after posting, and every restart resets the interval
    # timer, so without a catch-up run frequent deploys could let a story's
    # whole life fall between snapshots. The short delay lets the API settle
    # first; the misfire grace + coalesce handle a sleeping host.
    from datetime import datetime, timedelta, timezone
    story_first_run = datetime.now(timezone.utc) + timedelta(seconds=120)
    sch.add_job(
        _run_story_snapshot,
        IntervalTrigger(hours=settings.scheduler_story_snapshot_hours),
        id="story_snapshot",
        name="Snapshot live stories + insights",
        replace_existing=True,
        next_run_time=story_first_run,
    )

    # Comment-to-DM funnels — frequent because funnel latency is the feature
    # ("comment LINK" should be answered in minutes). The job no-ops quickly
    # when nobody has active funnels.
    sch.add_job(
        _run_dm_funnel_runner,
        IntervalTrigger(minutes=settings.scheduler_dm_funnel_minutes),
        id="dm_funnel_runner",
        name="Comment-to-DM funnel runner",
        replace_existing=True,
        next_run_time=None,
    )

    # Tier 4 / Phase F — Weekly AI digest synthesis. Charges under
    # feature='digest_auto' so it doesn't burn the user's monthly cap.
    sch.add_job(
        _run_weekly_digest,
        CronTrigger(
            day_of_week=settings.scheduler_weekly_digest_day,
            hour=settings.scheduler_weekly_digest_hour,
            minute=0,
        ),
        id="weekly_digest",
        name="Weekly AI digest synthesis",
        replace_existing=True,
    )

    sch.add_job(
        _run_yt_outlier_detection,
        CronTrigger(hour=2, minute=0),
        id="yt_outlier_detection",
        name="Daily YouTube competitor outlier scan (polling fallback)",
        replace_existing=True,
    )

    sch.add_job(
        _run_yt_archive_miner,
        CronTrigger(
            day_of_week=settings.scheduler_archive_miner_day,
            hour=settings.scheduler_archive_miner_hour,
            minute=30,
        ),
        id="yt_archive_miner",
        name="Weekly YouTube archive miner",
        replace_existing=True,
    )

    sch.start()
    _scheduler = sch
    logger.info(
        "Scheduler started: account_sync @ %02d:00 UTC daily, "
        "competitor_sync @ %02d:00 UTC daily, "
        "sentiment_batch every %d min, "
        "topic_clustering weekday=%d @ %02d:00 UTC, "
        "weekly_digest weekday=%d @ %02d:00 UTC, "
        "story_snapshot every %dh, "
        "dm_funnel_runner every %d min",
        settings.scheduler_account_sync_hour,
        settings.scheduler_competitor_sync_hour,
        settings.scheduler_sentiment_batch_minutes,
        settings.scheduler_topic_clustering_day,
        settings.scheduler_topic_clustering_hour,
        settings.scheduler_weekly_digest_day,
        settings.scheduler_weekly_digest_hour,
        settings.scheduler_story_snapshot_hours,
        settings.scheduler_dm_funnel_minutes,
    )


def shutdown_scheduler() -> None:
    """Stop the scheduler if it was started. Idempotent."""
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception:
        logger.exception("Scheduler shutdown raised")
    finally:
        _scheduler = None

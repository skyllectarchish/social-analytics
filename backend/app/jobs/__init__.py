"""Background batch jobs (Tier 2).

Each module is a self-contained `main()` runnable from cron / systemd / an
APScheduler trigger. The application code never imports these — they share
the existing app.database + app.config modules but operate independently.
"""

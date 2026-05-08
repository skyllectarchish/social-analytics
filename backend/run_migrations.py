"""Run SQL migrations against ClickHouse using clickhouse-migrations.

The clickhouse-migrations library automatically tracks which migration files
have been applied in a `db_migrations` table inside your ClickHouse database.
Re-running this script is always safe — already-applied migrations are skipped.

Usage:
    python run_migrations.py

Note on ports:
    - clickhouse-connect (used by the app)  uses HTTPS port 8443
    - clickhouse-migrations (used here)     uses native TCP port 9440 (secure)
    Both values are read from .env. CLICKHOUSE_PORT (8443) is for the app;
    CLICKHOUSE_NATIVE_PORT (9440) is for migrations.
"""

import os
import sys
from pathlib import Path

from clickhouse_migrations.clickhouse_cluster import ClickhouseCluster
from dotenv import load_dotenv

# Load .env from the same directory as this script
load_dotenv(Path(__file__).parent / ".env")

_required = ["CLICKHOUSE_HOST", "CLICKHOUSE_USER", "CLICKHOUSE_PASSWORD"]
_missing = [k for k in _required if not os.environ.get(k)]
if _missing:
    print(f"ERROR: Missing required environment variables: {', '.join(_missing)}", file=sys.stderr)
    print("Copy .env.example to .env and fill in your credentials.", file=sys.stderr)
    sys.exit(1)

# ClickHouse Cloud uses port 9440 for secure native TCP (used by clickhouse-migrations).
# This is different from port 8443 (HTTPS) used by clickhouse-connect in the app.
# `secure=True` is forwarded as **kwargs to clickhouse-driver.Client() for TLS.
cluster = ClickhouseCluster(
    db_host=os.environ["CLICKHOUSE_HOST"],
    db_port=int(os.environ.get("CLICKHOUSE_NATIVE_PORT", 9440)),
    db_user=os.environ["CLICKHOUSE_USER"],
    db_password=os.environ["CLICKHOUSE_PASSWORD"],
    secure=True,
)

migrations_dir = str(Path(__file__).parent / "migrations")

print(f"Connecting to {os.environ['CLICKHOUSE_HOST']}...")
print(f"Running migrations from: {migrations_dir}")

try:
    cluster.migrate(
        db_name=os.environ.get("CLICKHOUSE_DATABASE", "social_analytics"),
        migration_path=migrations_dir,
        cluster_name=None,          # None = single-node / ClickHouse Cloud
        create_db_if_no_exists=True,
        multi_statement=True,       # Allow multiple statements per .sql file
        dryrun=False,
        fake=False,
    )
    print("All migrations applied successfully.")
except Exception as exc:
    print(f"Migration failed: {exc}", file=sys.stderr)
    sys.exit(1)


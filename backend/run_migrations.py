"""Run SQL migrations against ClickHouse.

Tracks applied migrations in a `db_migrations` table.
Re-running is always safe — already-applied migrations are skipped.

Uses clickhouse-connect (HTTPS port 8443), same as the app itself.
No separate native TCP port needed.

Usage:
    python run_migrations.py
"""

import os
import re
import sys
from pathlib import Path

import clickhouse_connect
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

_required = ["CLICKHOUSE_HOST", "CLICKHOUSE_USER", "CLICKHOUSE_PASSWORD"]
_missing = [k for k in _required if not os.environ.get(k)]
if _missing:
    print(f"ERROR: Missing required environment variables: {', '.join(_missing)}", file=sys.stderr)
    print("Copy .env.example to .env and fill in your credentials.", file=sys.stderr)
    sys.exit(1)

host = os.environ["CLICKHOUSE_HOST"]
db = os.environ.get("CLICKHOUSE_DATABASE", "social_analytics")
port = int(os.environ.get("CLICKHOUSE_PORT", 8443))

print(f"Connecting to {host}...")

client = clickhouse_connect.get_client(
    host=host,
    port=port,
    username=os.environ["CLICKHOUSE_USER"],
    password=os.environ["CLICKHOUSE_PASSWORD"],
    secure=True,
)

# Ensure database exists
client.command(f"CREATE DATABASE IF NOT EXISTS `{db}`")
client = clickhouse_connect.get_client(
    host=host,
    port=port,
    username=os.environ["CLICKHOUSE_USER"],
    password=os.environ["CLICKHOUSE_PASSWORD"],
    database=db,
    secure=True,
)

# Tracking table
client.command("""
    CREATE TABLE IF NOT EXISTS db_migrations (
        version String,
        applied_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(applied_at)
    ORDER BY version
""")

# Already-applied versions
applied = {row[0] for row in client.query("SELECT version FROM db_migrations").result_rows}

migrations_dir = Path(__file__).parent / "migrations"
sql_files = sorted(migrations_dir.glob("*.sql"))

print(f"Running migrations from: {migrations_dir}")

applied_count = 0
skipped_count = 0

for path in sql_files:
    version = path.name
    if version in applied:
        skipped_count += 1
        continue

    print(f"  Applying {version}...")
    sql = path.read_text(encoding="utf-8")

    # Strip single-line comments before splitting so semicolons inside
    # comments don't produce spurious empty statements.
    sql = re.sub(r"--[^\n]*", "", sql)
    statements = [s.strip() for s in sql.split(";")]
    statements = [s for s in statements if s]  # drop empty

    try:
        for stmt in statements:
            client.command(stmt)
        client.command(
            "INSERT INTO db_migrations (version) VALUES ({version:String})",
            parameters={"version": version},
        )
        applied_count += 1
    except Exception as exc:
        print(f"Migration failed on {version}: {exc}", file=sys.stderr)
        sys.exit(1)

print(f"Done. Applied: {applied_count}, Skipped (already applied): {skipped_count}.")

"""Reset migration tracking for versions 32+ so run_migrations.py can re-apply them.

Version 32 in schema_versions is an Instagram archive migration; the local file
032_create_youtube_competitors.sql is different content — the migrations were
renumbered after being applied. All affected tables already exist in ClickHouse
so re-applying with IF NOT EXISTS is safe.

Usage:
    python reset_migrations.py
    python run_migrations.py
"""

import os
import sys
from pathlib import Path

from clickhouse_driver import Client
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

_required = ["CLICKHOUSE_HOST", "CLICKHOUSE_USER", "CLICKHOUSE_PASSWORD"]
_missing = [k for k in _required if not os.environ.get(k)]
if _missing:
    print(f"ERROR: Missing env vars: {', '.join(_missing)}", file=sys.stderr)
    sys.exit(1)

db = os.environ.get("CLICKHOUSE_DATABASE", "social_analytics")

client = Client(
    host=os.environ["CLICKHOUSE_HOST"],
    port=int(os.environ.get("CLICKHOUSE_NATIVE_PORT", 9440)),
    user=os.environ["CLICKHOUSE_USER"],
    password=os.environ["CLICKHOUSE_PASSWORD"],
    secure=True,
)

rows = client.execute(
    f"SELECT version, md5 FROM `{db}`.schema_versions WHERE version >= 32 ORDER BY version"
)

if not rows:
    print("No schema_versions records >= 32. Nothing to reset.")
    sys.exit(0)

print(f"Deleting {len(rows)} record(s) from schema_versions:")
for r in rows:
    print(f"  version={r[0]}")

client.execute(
    f"ALTER TABLE `{db}`.schema_versions DELETE WHERE version >= 32",
    settings={"mutations_sync": 2},
)

print(f"\nDeleted. Run: python run_migrations.py")

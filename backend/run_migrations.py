"""Run SQL migrations against ClickHouse."""
import os
import sys

import clickhouse_connect
from dotenv import load_dotenv

load_dotenv()

client = clickhouse_connect.get_client(
    host=os.environ["CLICKHOUSE_HOST"],
    port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
    username=os.environ["CLICKHOUSE_USER"],
    password=os.environ["CLICKHOUSE_PASSWORD"],
    database=os.environ.get("CLICKHOUSE_DATABASE", "social_analytics"),
    secure=True,
)

migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))

for fname in files:
    path = os.path.join(migrations_dir, fname)
    with open(path, encoding="utf-8") as f:
        sql = f.read().strip()
    print(f"Running {fname}...")
    for statement in sql.split(";"):
        stmt = statement.strip()
        if stmt:
            client.command(stmt)
    print(f"  OK")

print("All migrations applied.")

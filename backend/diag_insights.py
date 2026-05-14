"""Diagnostic: show what's in account_insights so we can see which metrics
have data and which are all-zero. Run once via `py diag_insights.py`."""

from app.database import get_client

client = get_client()

print("=== Metric coverage (last 365d) ===")
rows = client.query(
    """
    SELECT
        metric_name,
        count() AS rows_count,
        countIf(metric_value != 0) AS nonzero_rows,
        sum(metric_value) AS sum_value,
        min(end_time) AS earliest,
        max(end_time) AS latest
    FROM account_insights FINAL
    WHERE end_time >= now() - INTERVAL 365 DAY
    GROUP BY metric_name
    ORDER BY metric_name
    """
).result_rows
for r in rows:
    print(
        f"  {r[0]:<28} rows={r[1]:<6} nonzero={r[2]:<6} sum={r[3]:<12} "
        f"earliest={r[4]} latest={r[5]}"
    )

print("\n=== Sample rows (most recent 3 per metric) ===")
rows = client.query(
    """
    SELECT metric_name, metric_value, end_time, fetched_at
    FROM account_insights FINAL
    WHERE end_time >= now() - INTERVAL 365 DAY
    ORDER BY metric_name, end_time DESC
    LIMIT 60
    """
).result_rows
last_metric = None
shown = 0
for r in rows:
    if r[0] != last_metric:
        last_metric = r[0]
        shown = 0
        print(f"  -- {r[0]} --")
    if shown < 3:
        print(f"    value={r[1]:<10} end_time={r[2]} fetched_at={r[3]}")
        shown += 1

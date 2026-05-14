"""Diagnostic: probe Meta directly with the stored token.

Compares:
  1. Single GET for total_value (1-day window)
  2. Batch request (same as Call 2 in service.py)
to find out why the batch is yielding no rows.
"""

import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.constants import GRAPH_BASE_URL
from app.crypto import decrypt_token
from app.database import get_client


def fetch_token():
    rows = get_client().query(
        "SELECT ig_user_id, access_token FROM instagram_profiles FINAL "
        "ORDER BY updated_at DESC LIMIT 1"
    ).result_rows
    if not rows:
        sys.exit("No instagram_profile rows; connect an account first.")
    ig_user_id, enc = rows[0]
    return ig_user_id, decrypt_token(enc, settings.jwt_secret_key)


async def main():
    ig_user_id, token = fetch_token()
    print(f"ig_user_id={ig_user_id}\n")

    until = int(datetime.now(timezone.utc).timestamp())
    since = int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp())

    async with httpx.AsyncClient(timeout=30) as c:
        # --- 1. Single GET for total_interactions (1-day window) ---
        print("=== 1. Single GET: total_interactions (last 1d, total_value) ===")
        r = await c.get(
            f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
            params={
                "metric": "total_interactions",
                "period": "day",
                "metric_type": "total_value",
                "since": since,
                "until": until,
                "access_token": token,
            },
        )
        print(f"  status={r.status_code}")
        print(f"  body={r.text[:800]}\n")

        # --- 2. Single GET: follows_and_unfollows only (to inspect breakdown shape) ---
        print("=== 2. Single GET: follows_and_unfollows (last 1d, total_value) ===")
        r = await c.get(
            f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
            params={
                "metric": "follows_and_unfollows",
                "period": "day",
                "metric_type": "total_value",
                "since": since,
                "until": until,
                "access_token": token,
            },
        )
        print(f"  status={r.status_code}")
        if r.status_code == 200:
            # Strip localized title/description fields that mangle Windows cp1252 console.
            data = r.json().get("data", [])
            for entry in data:
                entry.pop("title", None)
                entry.pop("description", None)
            print(f"  parsed: {json.dumps(data, indent=2)[:2000]}\n")
        else:
            print(f"  body={r.text[:1500]}\n")

        # --- 2b. follows_and_unfollows WITH breakdown ---
        print("=== 2b. Single GET: follows_and_unfollows + breakdown=follow_type ===")
        r = await c.get(
            f"{GRAPH_BASE_URL}/{ig_user_id}/insights",
            params={
                "metric": "follows_and_unfollows",
                "period": "day",
                "metric_type": "total_value",
                "breakdown": "follow_type",
                "since": since,
                "until": until,
                "access_token": token,
            },
        )
        print(f"  status={r.status_code}")
        if r.status_code == 200:
            data = r.json().get("data", [])
            for entry in data:
                entry.pop("title", None)
                entry.pop("description", None)
            print(f"  parsed: {json.dumps(data, indent=2)[:2000]}\n")
        else:
            print(f"  body={r.text[:1500]}\n")

        # --- 3. Batch request (the suspect) ---
        print("=== 3. Batch POST (the way service.py builds it) ===")
        batch = [{
            "method": "GET",
            "relative_url": (
                f"{ig_user_id}/insights?metric=views,follows_and_unfollows,"
                f"total_interactions,accounts_engaged,saves,shares"
                f"&period=day&metric_type=total_value"
                f"&since={since}&until={until}"
            ),
        }]
        r = await c.post(
            GRAPH_BASE_URL,
            data={"access_token": token, "batch": json.dumps(batch)},
        )
        print(f"  status={r.status_code}")
        print(f"  body={r.text[:1500]}\n")


if __name__ == "__main__":
    asyncio.run(main())

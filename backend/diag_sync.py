"""Diagnostic: drive a real fetch_account_insights call end-to-end with the
fresh service.py code, then show what landed in the merged dict before storage.

Use a 7-day window so we get quick feedback without 365 sequential requests.
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.crypto import decrypt_token
from app.database import get_client
from app.instagram import service


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
    until = int(datetime.now(timezone.utc).timestamp())
    since = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())
    print(f"ig_user_id={ig_user_id}, window=last 7d")

    raw = await service.fetch_account_insights(ig_user_id, token, since, until)

    print(f"\nGot {len(raw)} metrics:")
    for m in raw:
        vals = m.get("values", [])
        if not vals:
            print(f"  {m['name']:<28} (no values)")
            continue
        nonzero = sum(1 for v in vals if v.get("value", 0) != 0)
        sample = vals[:3]
        print(f"  {m['name']:<28} {len(vals)} points, {nonzero} nonzero, sample={sample}")


if __name__ == "__main__":
    asyncio.run(main())

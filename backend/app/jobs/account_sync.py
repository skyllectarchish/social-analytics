"""Daily own-account sync job.

For every user with a connected Instagram account:

1. Refresh the long-lived token when it expires within
   `TOKEN_REFRESH_THRESHOLD_DAYS` (Meta's `ig_refresh_token` grant). Without
   this, tokens silently die after ~60 days and every feature breaks until
   the user re-OAuths.
2. Re-fetch profile + media so follower counts and new posts land in
   ClickHouse without the user pressing "Sync".
3. Run the same insights sync that POST /api/instagram/insights/sync performs,
   over a short `ACCOUNT_SYNC_LOOKBACK_DAYS` window. This is what accumulates
   the long-term follower/reach history that outlives Meta's ~90-day
   retention — snapshots only build up if something writes them daily.

Per-user failures are isolated: one dead token or Meta hiccup never blocks
the other accounts.

Usage:
    cd backend
    python -m app.jobs.account_sync
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..crypto import decrypt_token, encrypt_token
from ..database import get_client
from ..exceptions import OAuthError
from ..models.queries import GET_ALL_INSTAGRAM_TOKENS
from ..repositories import instagram_repo

logger = logging.getLogger(__name__)


async def _sync_user(
    client,
    user_id: str,
    ig_user_id: str,
    encrypted_token: str,
    token_expires_at: datetime,
) -> bool:
    """Sync one connected account. Returns True on success.

    Raises nothing fatal itself — Meta/HTTP errors propagate to the caller's
    per-user exception barrier in `_run()`.
    """
    # Lazy imports: service for the Graph API calls, and the insights-sync
    # orchestrator that the /insights/sync route already uses (reused verbatim
    # so scheduled and manual syncs can never drift apart).
    from ..instagram import service
    from ..instagram.router import _run_insights_sync

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    token = decrypt_token(encrypted_token, settings.jwt_secret_key)
    expires_at = token_expires_at

    if expires_at <= now:
        logger.warning(
            "account_sync: token already expired for user %s — skipping "
            "(user must reconnect via /connect)", user_id,
        )
        return False

    # --- 1. Token refresh, when inside the threshold window ---
    if expires_at - now < timedelta(days=settings.token_refresh_threshold_days):
        try:
            token, expires_in = await service.refresh_long_lived_token(token)
            expires_at = now + timedelta(seconds=expires_in)
            logger.info(
                "account_sync: token refreshed for user %s (new expiry %s)",
                user_id, expires_at.date(),
            )
        except OAuthError:
            # Keep going with the current token — it's still valid for now,
            # and the next daily run will retry the refresh.
            logger.warning(
                "account_sync: token refresh failed for user %s — "
                "continuing with current token (expires %s)",
                user_id, expires_at,
            )

    # --- 2. Profile + media (same writes as POST /refresh) ---
    profile_data = await service.fetch_profile(ig_user_id, token)
    media_list = await service.fetch_media(ig_user_id, token)
    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data,
        encrypt_token(token, settings.jwt_secret_key), expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    # --- 3. Insights top-up (account metrics, demographics, media, comments) ---
    await _run_insights_sync(
        user_id, ig_user_id, token,
        lookback_days=settings.account_sync_lookback_days,
    )
    return True


async def _run() -> int:
    client = get_client()
    rows = client.query(GET_ALL_INSTAGRAM_TOKENS).result_rows
    if not rows:
        logger.info("account_sync: no connected accounts")
        return 0

    synced = 0
    for user_id, ig_user_id, encrypted_token, token_expires_at in rows:
        try:
            if await _sync_user(
                client, str(user_id), ig_user_id, encrypted_token, token_expires_at,
            ):
                synced += 1
        except Exception:
            logger.exception("account_sync: sync failed for user %s", user_id)

    logger.info("account_sync: %d/%d accounts synced", synced, len(rows))
    return synced


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()

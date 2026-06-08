"""Comment-to-DM keyword funnel runner.

For every user with at least one active funnel ("comment LINK and I'll DM
you"), this job:

1. Fetches fresh comments straight from the Graph API for the user's recent
   posts (plus any post a funnel is explicitly scoped to). It does NOT rely
   on the 24h comment sync — funnel latency should be minutes, not a day.
   Fetched comments are also stored, which keeps the inbox fresher as a
   side effect.
2. Matches comment text against funnel keywords (case-insensitive, word
   boundary — "link" must not fire on "linkedin").
3. Sends the funnel's DM via Meta's private-reply API (one DM per comment,
   ever — dm_funnel_sends is the dedup ledger) and optionally posts the
   public comment reply ("check your DMs!").

Guardrails:
- only comments posted AFTER the funnel was created trigger it (no
  retroactive DM blasts when a funnel is added),
- private replies are only valid for 7 days, so older comments are skipped,
- per-user sends are capped per run to stay clear of messaging rate limits,
- the creator's own comments never trigger funnels.

Usage:
    cd backend
    python -m app.jobs.dm_funnel_runner
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..crypto import decrypt_token
from ..database import get_client
from ..exceptions import InstagramAPIError
from ..models.queries import GET_ALL_INSTAGRAM_TOKENS
from ..repositories import comment_repo, dm_funnel_repo, instagram_repo

logger = logging.getLogger(__name__)

#: How many recent posts to scan for trigger comments each run.
MEDIA_SCAN_LIMIT = 10
#: Meta only allows private replies within 7 days of the comment.
PRIVATE_REPLY_WINDOW_DAYS = 7


def _keyword_matches(keyword: str, text: str) -> bool:
    """Word-boundary, case-insensitive match ('link' ≠ 'linkedin')."""
    return re.search(rf"(?<!\w){re.escape(keyword)}(?!\w)", text, re.IGNORECASE) is not None


def _parse_ts(ts_str: str, fallback: datetime) -> datetime:
    try:
        return (
            datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
    except (ValueError, TypeError):
        return fallback


async def _run_user(
    client,
    user_id: str,
    ig_user_id: str,
    token: str,
    funnels: list[dict],
) -> int:
    """Process one user's funnels. Returns the number of DMs sent."""
    from ..instagram import service

    profile = instagram_repo.find_profile(client, user_id)
    self_username = profile.username if profile else ""

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    window_start = now - timedelta(days=PRIVATE_REPLY_WINDOW_DAYS)

    # Recent posts + any post a funnel is explicitly scoped to.
    media_ids = dm_funnel_repo.recent_media_ids(
        client, user_id, ig_user_id,
        since=now - timedelta(days=settings.dm_funnel_media_lookback_days),
        limit=MEDIA_SCAN_LIMIT,
    )
    scoped = [f["ig_media_id"] for f in funnels if f["ig_media_id"]]
    media_ids = list(dict.fromkeys(media_ids + scoped))
    if not media_ids:
        return 0

    already_sent = dm_funnel_repo.sent_comment_ids(client, user_id)
    sends = 0

    for media_id in media_ids:
        if sends >= settings.dm_funnel_max_sends_per_run:
            logger.info(
                "dm_funnel_runner: per-run send cap (%d) reached for user %s",
                settings.dm_funnel_max_sends_per_run, user_id,
            )
            break

        try:
            raw_comments = await service.fetch_comments_for_media(
                media_id, token, max_pages=2,
            )
        except Exception:
            logger.warning(
                "dm_funnel_runner: comment fetch failed for media %s", media_id,
            )
            continue
        if not raw_comments:
            continue

        # Side effect: persist what we fetched so the inbox stays fresh.
        try:
            comment_repo.bulk_insert_comments(
                client, user_id, media_id,
                [
                    {
                        "id": c.get("id", ""),
                        "_parent_id": c.get("_parent_id", ""),
                        "username": c.get("username", ""),
                        "text": c.get("text", "") or "",
                        "like_count": c.get("like_count", 0),
                        "timestamp": c.get("timestamp", ""),
                    }
                    for c in raw_comments
                    if c.get("id")
                ],
            )
        except Exception:
            logger.warning(
                "dm_funnel_runner: comment store failed for media %s", media_id,
            )

        for c in raw_comments:
            if sends >= settings.dm_funnel_max_sends_per_run:
                break
            comment_id = c.get("id", "")
            username = c.get("username", "") or ""
            text = c.get("text", "") or ""
            if not comment_id or comment_id in already_sent:
                continue
            if not text or (self_username and username == self_username):
                continue
            ts = _parse_ts(c.get("timestamp", ""), now)
            if ts < window_start:
                continue  # outside the private-reply window

            for funnel in funnels:
                if funnel["ig_media_id"] and funnel["ig_media_id"] != media_id:
                    continue
                if ts < funnel["created_at"]:
                    continue  # comment predates the funnel
                if not _keyword_matches(funnel["keyword"], text):
                    continue

                status, error = "sent", ""
                # Count every send attempt toward the per-run cap, not just
                # successes: a failed attempt still consumed a messaging-API
                # call, and the cap exists to stay within Meta's rate limits.
                sends += 1
                try:
                    await service.send_private_reply(comment_id, funnel["dm_message"], token)
                    if funnel["public_reply"]:
                        try:
                            await service.post_comment_reply(
                                comment_id, funnel["public_reply"], token,
                            )
                        except InstagramAPIError as exc:
                            # DM went out — the funnel did its job. Note the
                            # public-reply failure without failing the send.
                            error = f"public reply failed: {exc}"
                except InstagramAPIError as exc:
                    status, error = "failed", str(exc)

                dm_funnel_repo.log_send(
                    client, user_id,
                    funnel_id=funnel["funnel_id"],
                    keyword=funnel["keyword"],
                    ig_comment_id=comment_id,
                    ig_media_id=media_id,
                    commenter_username=username,
                    comment_text=text,
                    status=status,
                    error=error,
                )
                already_sent.add(comment_id)
                # First matching funnel wins — never DM one comment twice.
                break

            await asyncio.sleep(0.2)  # be gentle with the messaging API

    return sends


async def _run() -> int:
    client = get_client()
    funnels_by_user = dm_funnel_repo.list_all_active_funnels(client)
    if not funnels_by_user:
        logger.debug("dm_funnel_runner: no active funnels")
        return 0

    tokens = {
        str(r[0]): (r[1], r[2], r[3])
        for r in client.query(GET_ALL_INSTAGRAM_TOKENS).result_rows
    }
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    total = 0
    for user_id, funnels in funnels_by_user.items():
        creds = tokens.get(user_id)
        if creds is None:
            continue  # funnel owner disconnected their IG account
        ig_user_id, encrypted_token, expires_at = creds
        if expires_at <= now:
            logger.warning(
                "dm_funnel_runner: token expired for user %s — skipping", user_id,
            )
            continue
        try:
            token = decrypt_token(encrypted_token, settings.jwt_secret_key)
            total += await _run_user(client, user_id, ig_user_id, token, funnels)
        except Exception:
            logger.exception("dm_funnel_runner: failed for user %s", user_id)

    if total:
        logger.info("dm_funnel_runner: %d DMs sent this run", total)
    return total


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()

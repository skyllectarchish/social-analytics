"""PubSubHubbub webhook endpoints for YouTube Phase 2.

GET  /api/youtube/webhook/verify  — hub subscription challenge echo
POST /api/youtube/webhook/receive — XML feed notification handler

These endpoints are public (no auth) — YouTube calls them directly.
"""

import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Query, Request, Response

from ..database import get_client
from ..repositories import youtube_repo
from . import service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube/webhook", tags=["youtube-webhook"])

_ATOM_NS = "http://www.w3.org/2005/Atom"
_YT_NS = "http://www.youtube.com/xml/schemas/2015"


def _parse_notification(body: str) -> list[dict]:
    """Parse Atom XML from YouTube PubSubHubbub → list of notification dicts."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return []
    ns = {"atom": _ATOM_NS, "yt": _YT_NS}
    entries = []
    for entry in root.findall("atom:entry", ns):
        video_id = entry.findtext("yt:videoId", default="", namespaces=ns)
        channel_id = entry.findtext("yt:channelId", default="", namespaces=ns)
        title = entry.findtext("atom:title", default="", namespaces=ns)
        updated_str = entry.findtext("atom:updated", default="", namespaces=ns)
        if video_id and channel_id:
            entries.append({"video_id": video_id, "channel_id": channel_id,
                             "title": title, "updated_str": updated_str})
    return entries


@router.get("/verify")
def verify(
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_mode: str = Query(default="", alias="hub.mode"),
):
    """PubSubHubbub subscription verification — echo the challenge."""
    if hub_mode == "unsubscribe":
        logger.warning("WebSub unsubscribe verification denied")
        return Response(status_code=404)
    logger.info("WebSub verify: mode=%s", hub_mode)
    return Response(content=hub_challenge, media_type="text/plain")


@router.post("/receive")
async def receive(request: Request, background_tasks: BackgroundTasks):
    """Receive XML feed notification from YouTube hub."""
    body = (await request.body()).decode("utf-8", errors="replace")
    notifications = _parse_notification(body)
    if not notifications:
        return Response(status_code=204)

    try:
        client = get_client()

        for notif in notifications:
            channel_id = notif["channel_id"]
            video_id = notif["video_id"]
            title = notif["title"]

            # Own channel: find user by yt_channel_id in youtube_tokens
            own_rows = client.query(
                "SELECT user_id FROM youtube_tokens FINAL WHERE yt_channel_id = {cid:String} LIMIT 1",
                parameters={"cid": channel_id},
            ).result_rows
            if own_rows:
                user_id = str(own_rows[0][0])
                background_tasks.add_task(
                    _handle_own_channel_notification, user_id, channel_id, video_id, title
                )

            # Competitor channel: find all users tracking this channel
            comp_rows = client.query(
                "SELECT DISTINCT user_id FROM youtube_competitors FINAL "
                "WHERE competitor_channel_id = {cid:String} AND is_deleted = false",
                parameters={"cid": channel_id},
            ).result_rows
            for row in comp_rows:
                user_id = str(row[0])
                background_tasks.add_task(
                    _handle_competitor_notification, user_id, channel_id, video_id, title
                )
    except Exception:
        logger.exception("Webhook receive DB error — YouTube hub will retry")
        return Response(status_code=500)

    return Response(status_code=204)


async def _handle_own_channel_notification(user_id: str, channel_id: str, video_id: str, title: str) -> None:
    """Record title change + schedule Golden Hour check + run preflight."""
    from ..config import settings
    client = get_client()
    youtube_repo.record_title_if_changed(client, user_id, channel_id, video_id, title)

    if settings.enable_scheduler:
        try:
            from ..scheduler import schedule_golden_hour
            schedule_golden_hour(user_id, channel_id, video_id)
        except Exception:
            logger.exception("Failed to schedule golden hour for video %s", video_id)

    try:
        from ..jobs.yt_preflight import run_preflight
        await run_preflight(user_id, video_id, title)
    except Exception:
        logger.exception("Preflight check failed for video %s", video_id)


async def _handle_competitor_notification(user_id: str, channel_id: str, video_id: str, title: str) -> None:
    """Record title history and schedule velocity checks for competitor video."""
    from ..config import settings
    client = get_client()
    youtube_repo.record_title_if_changed(client, user_id, channel_id, video_id, title)

    if settings.enable_scheduler:
        try:
            from ..scheduler import schedule_velocity_checks
            schedule_velocity_checks(user_id, channel_id, video_id)
        except Exception:
            logger.exception("Failed to schedule velocity checks for video %s", video_id)

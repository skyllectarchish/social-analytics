from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth.dependencies import get_current_user
from ..database import get_client
from ..models.queries import (
    COUNT_INSTAGRAM_MEDIA,
    GET_INSTAGRAM_MEDIA_PAGE,
    GET_INSTAGRAM_PROFILE,
    GET_INSTAGRAM_TOKEN,
)
from . import service
from .schemas import CallbackResponse, ConnectResponse, InstagramMedia, InstagramProfile, MediaListResponse

router = APIRouter(prefix="/api/instagram", tags=["instagram"])


@router.get("/connect", response_model=ConnectResponse)
def connect(_: dict = Depends(get_current_user)):
    return ConnectResponse(oauth_url=service.get_oauth_url())


@router.get("/callback", response_model=CallbackResponse)
def callback(
    code: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        short_token = service.exchange_code_for_token(code)
        long_token, expires_in = service.get_long_lived_token(short_token)
        ig_user_id, token = service.get_instagram_business_account(long_token)
        profile_data = service.fetch_profile(ig_user_id, token)
        media_list = service.fetch_media(ig_user_id, token)

        service.store_profile(current_user["id"], ig_user_id, profile_data, token, expires_in)
        service.store_media(current_user["id"], ig_user_id, media_list)

        profile = InstagramProfile(
            id=current_user["id"],
            ig_user_id=ig_user_id,
            username=profile_data.get("username", ""),
            name=profile_data.get("name", ""),
            biography=profile_data.get("biography", ""),
            profile_picture_url=profile_data.get("profile_picture_url", ""),
            followers_count=profile_data.get("followers_count", 0),
            follows_count=profile_data.get("follows_count", 0),
            media_count=profile_data.get("media_count", 0),
            connected_at="now",
        )
        return CallbackResponse(success=True, profile=profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Instagram connection failed: {str(e)}")


@router.get("/profile", response_model=InstagramProfile)
def get_profile(current_user: dict = Depends(get_current_user)):
    client = get_client()
    rows = client.query(GET_INSTAGRAM_PROFILE, parameters={"user_id": current_user["id"]})
    if not rows.result_rows:
        raise HTTPException(status_code=404, detail="No Instagram account connected")

    r = rows.result_rows[0]
    return InstagramProfile(
        id=str(r[0]),
        ig_user_id=r[1],
        username=r[2],
        name=r[3],
        biography=r[4],
        profile_picture_url=r[5],
        followers_count=r[6],
        follows_count=r[7],
        media_count=r[8],
        connected_at=str(r[9]),
    )


@router.get("/media", response_model=MediaListResponse)
def get_media(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    client = get_client()
    offset = (page - 1) * page_size

    count_rows = client.query(COUNT_INSTAGRAM_MEDIA, parameters={"user_id": current_user["id"]})
    total = count_rows.result_rows[0][0] if count_rows.result_rows else 0

    rows = client.query(
        GET_INSTAGRAM_MEDIA_PAGE,
        parameters={"user_id": current_user["id"], "limit": page_size, "offset": offset},
    )

    items = [
        InstagramMedia(
            ig_media_id=r[0],
            media_type=r[1],
            media_url=r[2],
            thumbnail_url=r[3],
            permalink=r[4],
            caption=r[5],
            timestamp=str(r[6]),
            like_count=r[7],
            comments_count=r[8],
        )
        for r in rows.result_rows
    ]
    return MediaListResponse(items=items, total=total)


@router.post("/refresh", response_model=CallbackResponse)
def refresh(current_user: dict = Depends(get_current_user)):
    client = get_client()
    rows = client.query(GET_INSTAGRAM_TOKEN, parameters={"user_id": current_user["id"]})
    if not rows.result_rows:
        raise HTTPException(status_code=404, detail="No Instagram account connected")

    r = rows.result_rows[0]
    ig_user_id, token = r[0], r[1]

    try:
        profile_data = service.fetch_profile(ig_user_id, token)
        media_list = service.fetch_media(ig_user_id, token)
        service.store_profile(current_user["id"], ig_user_id, profile_data, token, 5184000)
        service.store_media(current_user["id"], ig_user_id, media_list)

        profile = InstagramProfile(
            id=current_user["id"],
            ig_user_id=ig_user_id,
            username=profile_data.get("username", ""),
            name=profile_data.get("name", ""),
            biography=profile_data.get("biography", ""),
            profile_picture_url=profile_data.get("profile_picture_url", ""),
            followers_count=profile_data.get("followers_count", 0),
            follows_count=profile_data.get("follows_count", 0),
            media_count=profile_data.get("media_count", 0),
            connected_at="now",
        )
        return CallbackResponse(success=True, profile=profile)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

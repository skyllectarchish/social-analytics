from pydantic import BaseModel


class InstagramProfile(BaseModel):
    id: str
    ig_user_id: str
    username: str
    name: str
    biography: str
    profile_picture_url: str
    followers_count: int
    follows_count: int
    media_count: int
    connected_at: str


class InstagramMedia(BaseModel):
    ig_media_id: str
    media_type: str
    media_url: str
    thumbnail_url: str
    permalink: str
    caption: str
    timestamp: str
    like_count: int
    comments_count: int


class MediaListResponse(BaseModel):
    items: list[InstagramMedia]
    total: int


class ConnectResponse(BaseModel):
    oauth_url: str


class CallbackResponse(BaseModel):
    success: bool
    profile: InstagramProfile

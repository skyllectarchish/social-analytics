GET_USER_BY_EMAIL = """
SELECT id, email, username, hashed_password, is_active
FROM users
WHERE email = {email:String}
LIMIT 1
"""

GET_USER_BY_ID = """
SELECT id, email, username, is_active
FROM users
WHERE id = {user_id:String}
LIMIT 1
"""

CHECK_EMAIL_EXISTS = """
SELECT id FROM users
WHERE email = {email:String}
LIMIT 1
"""

GET_INSTAGRAM_PROFILE = """
SELECT id, ig_user_id, username, name, biography, profile_picture_url,
       followers_count, follows_count, media_count, connected_at
FROM instagram_profiles
WHERE user_id = {user_id:String}
ORDER BY updated_at DESC
LIMIT 1
"""

GET_INSTAGRAM_TOKEN = """
SELECT ig_user_id, access_token, token_expires_at
FROM instagram_profiles
WHERE user_id = {user_id:String}
ORDER BY updated_at DESC
LIMIT 1
"""

COUNT_INSTAGRAM_MEDIA = """
SELECT count()
FROM instagram_media
WHERE user_id = {user_id:String}
"""

GET_INSTAGRAM_MEDIA_PAGE = """
SELECT ig_media_id, media_type, media_url, thumbnail_url, permalink,
       caption, timestamp, like_count, comments_count
FROM instagram_media
WHERE user_id = {user_id:String}
ORDER BY timestamp DESC
LIMIT {limit:UInt32} OFFSET {offset:UInt32}
"""

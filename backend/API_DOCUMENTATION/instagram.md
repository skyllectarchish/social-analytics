# Instagram Core Integration API

This section details the endpoints used to connect an Instagram Business/Creator account via Meta OAuth, fetch the connected profile, and retrieve a paginated list of the user's media posts.

All routes are mounted under the prefix `/api/instagram`. Every endpoint requires an authenticated user (Bearer JWT).

> **Account requirement:** the connected Instagram account must be a **Business** or **Creator** account linked to a Facebook Page. Personal accounts are not supported by the Meta Graph API endpoints this service uses.

---

## 1. Connect Instagram (Initiate OAuth)
Initiates the OAuth 2.0 flow. The frontend should request this URL and then redirect the user to the provided `oauth_url`.

* **URL:** `/api/instagram/connect`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Response (200 OK)
Returns the Meta OAuth dialog URL and a CSRF `state` token.

```json
{
  "oauth_url": "https://www.facebook.com/v21.0/dialog/oauth?client_id=123...&redirect_uri=...&scope=instagram_basic%2Cpages_show_list%2Cpages_read_engagement%2Cinstagram_manage_insights%2Cbusiness_management&response_type=code&state=xyz...",
  "state": "random_secure_csrf_string"
}
```

Requested scopes: `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `instagram_manage_insights`, `business_management`.

> **Frontend Integration Note:** You must store the `state` value (e.g., in `localStorage` or `sessionStorage`) before redirecting the user. When Meta redirects back to your app, you should verify the state matches before forwarding the `code` to `/callback`, to prevent Cross-Site Request Forgery (CSRF).

---

## 2. OAuth Callback
Handles the redirect from Meta after the user authorizes the app. It exchanges the authorization `code` for a long-lived access token (~60 days), discovers the user's Instagram Business Account ID by walking `/me/accounts`, fetches the initial profile and media data, and stores everything in ClickHouse. The long-lived token is encrypted before storage.

* **URL:** `/api/instagram/callback`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `code` (string, **required**): The authorization code appended to the URL by Meta.
* `state` (string, optional): The CSRF state token to verify. The frontend should verify state equality client-side before invoking this endpoint.

### Example Request
`GET /api/instagram/callback?code=AQBxyz...&state=random_secure_csrf_string`

### Response (200 OK)
Returns a success flag and the newly connected Instagram profile data. The `id` field is the application's user ID, not the Instagram ID (see `ig_user_id` for that).

```json
{
  "success": true,
  "profile": {
    "id": "e9b5e5f3-1f4f-41fc-b1ac-daf3f2a1b9c8",
    "ig_user_id": "17841400000000000",
    "username": "creator_ig_handle",
    "name": "Creator Name",
    "biography": "Link in bio! 🚀",
    "profile_picture_url": "https://scontent.cdninstagram.com/...",
    "followers_count": 15420,
    "follows_count": 450,
    "media_count": 128,
    "connected_at": "now"
  }
}
```

### Error Responses
* **400 Bad Request** — `OAuthError`: code/token exchange failed, or the user has no linked Page with a Business Instagram Account.
* **502 Bad Gateway** — Upstream Meta Graph API returned an error during profile/media fetch.

---

## 3. Get Connected Profile
Retrieves the stored Instagram profile data for the currently authenticated user. Read-only; does not touch the Graph API.

* **URL:** `/api/instagram/profile`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Response (200 OK)
```json
{
  "id": "e9b5e5f3-1f4f-41fc-b1ac-daf3f2a1b9c8",
  "ig_user_id": "17841400000000000",
  "username": "creator_ig_handle",
  "name": "Creator Name",
  "biography": "Link in bio! 🚀",
  "profile_picture_url": "https://scontent.cdninstagram.com/...",
  "followers_count": 15420,
  "follows_count": 450,
  "media_count": 128,
  "connected_at": "2026-05-08 14:30:00"
}
```

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`: the user has not completed the OAuth flow. Frontend should route them to `/connect`.

---

## 4. Get Media (Paginated)
Retrieves a paginated list of the user's stored Instagram media posts (Images, Videos/Reels, Carousels). Ordered by `timestamp DESC`. Read-only; does not touch the Graph API.

* **URL:** `/api/instagram/media`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `page` (integer, optional): The page number to retrieve. Default `1`, minimum `1`.
* `page_size` (integer, optional): Number of items per page. Default `12`, minimum `1`, maximum `50`.

### Example Request
`GET /api/instagram/media?page=1&page_size=10`

### Response (200 OK)
Returns a list of media items and the total count.

```json
{
  "items": [
    {
      "ig_media_id": "18000000000000001",
      "media_type": "VIDEO",
      "media_url": "https://scontent.cdninstagram.com/...mp4",
      "thumbnail_url": "https://scontent.cdninstagram.com/...jpg",
      "permalink": "https://www.instagram.com/reel/xyz123/",
      "caption": "Check out this new reel! #viral",
      "timestamp": "2026-05-07 10:00:00",
      "like_count": 4500,
      "comments_count": 120
    },
    {
      "ig_media_id": "18000000000000002",
      "media_type": "CAROUSEL_ALBUM",
      "media_url": "https://scontent.cdninstagram.com/...jpg",
      "thumbnail_url": "",
      "permalink": "https://www.instagram.com/p/abc456/",
      "caption": "Photo dump 📸",
      "timestamp": "2026-05-05 18:30:00",
      "like_count": 3200,
      "comments_count": 85
    }
  ],
  "total": 128
}
```

### Error Responses
* **422 Unprocessable Entity** — `page` or `page_size` out of allowed range.

> **Note:** Unlike the other Instagram endpoints, this one does **not** raise `InstagramNotConnectedError`. If the user is not connected it simply returns `{"items": [], "total": 0}`.

---

## 5. Refresh Profile & Media Data
Forces a manual re-fetch of the basic profile and media data from the Meta Graph API using the stored long-lived token (no new OAuth round-trip) and updates the local database.

> This does **not** sync analytics/insights — only the basic post list and follower counts. For insights, call `/api/instagram/insights/sync` (see [Analytics & Insights](./insights.md)).

* **URL:** `/api/instagram/refresh`
* **Method:** `POST`
* **Requires Auth:** Yes (Bearer Token)

### Response (200 OK)
Returns the updated profile data (same structure as `/api/instagram/callback`).

```json
{
  "success": true,
  "profile": {
    "id": "e9b5e5f3-1f4f-41fc-b1ac-daf3f2a1b9c8",
    "ig_user_id": "17841400000000000",
    "username": "creator_ig_handle",
    "name": "Creator Name",
    "biography": "Link in bio! 🚀",
    "profile_picture_url": "https://scontent.cdninstagram.com/...",
    "followers_count": 15455,
    "follows_count": 450,
    "media_count": 129,
    "connected_at": "now"
  }
}
```

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`: user has not connected an Instagram account.
* **502 Bad Gateway** — Upstream Meta Graph API request failed.

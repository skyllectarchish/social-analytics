# Instagram Core Integration API

This section details the endpoints used to connect an Instagram Business/Creator account via Meta OAuth, fetch the connected profile, and retrieve a paginated list of the user's media posts.

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
  "oauth_url": "https://www.facebook.com/v21.0/dialog/oauth?client_id=123...&redirect_uri=...&scope=...&state=xyz...",
  "state": "random_secure_csrf_string"
}
```
> **Frontend Integration Note:** You must store the `state` value (e.g., in `localStorage` or `sessionStorage`) before redirecting the user. When Meta redirects back to your app, you should verify the state matches to prevent Cross-Site Request Forgery (CSRF).

---

## 2. OAuth Callback
Handles the redirect from Meta after the user authorizes the app. It exchanges the authorization `code` for a long-lived access token, fetches the initial profile and media data, and stores it in the database.

* **URL:** `/api/instagram/callback`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `code` (string, required): The authorization code appended to the URL by Meta.
* `state` (string, optional): The CSRF state token to verify.

### Example Request
`GET /api/instagram/callback?code=AQBxyz...&state=random_secure_csrf_string`

### Response (200 OK)
Returns a success flag and the newly connected Instagram profile data.

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

---

## 3. Get Connected Profile
Retrieves the stored Instagram profile data for the currently authenticated user.

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
* **400 Bad Request:** Throws `InstagramNotConnectedError` if the user hasn't completed the OAuth flow.

---

## 4. Get Media (Paginated)
Retrieves a paginated list of the user's stored Instagram media posts (Images, Videos/Reels, Carousels).

* **URL:** `/api/instagram/media`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `page` (integer, optional): The page number to retrieve. Default is `1`.
* `page_size` (integer, optional): Number of items per page. Default is `12`, Max is `50`.

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

---

## 5. Refresh Profile & Media Data
Forces a manual re-fetch of the basic profile and media data from the Meta Graph API and updates the local database. Note: This does **not** sync analytics/insights; it only syncs the basic post list and follower counts.

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

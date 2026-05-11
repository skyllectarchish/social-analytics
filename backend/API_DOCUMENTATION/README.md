# Social Analytics API Documentation

Welcome to the backend API documentation for the Social Analytics platform. This documentation is designed to be easily readable by both human developers and AI coding agents to facilitate seamless frontend integration.

## 🔗 Base URL
All API requests should be prefixed with your backend's base URL (e.g., `http://localhost:8000`).

The FastAPI app also exposes interactive docs at `/docs` (Swagger UI) and `/redoc` while the server is running.

## 🔐 Authentication
Most endpoints require authentication. The backend uses JSON Web Tokens (JWT) signed with HS256.
When an endpoint states `Requires Auth: Yes`, you must include the token in the `Authorization` header of your HTTP request.

**Format:**
```http
Authorization: Bearer <your_jwt_token>
```

Tokens are returned by `POST /api/auth/register` and `POST /api/auth/login`. The token's `sub` claim is the user's UUID. Send the token on every protected request; the backend will respond with `401 Unauthorized` if the header is missing, malformed, or expired.

## 📚 API Categories

The API is divided into three main categories. Click on the links below to view the detailed endpoint documentation, complete with sample payloads and expected responses.

1. **[Authentication & Users](./auth.md)**
   * Endpoints for user registration, login, and fetching the current user profile.
2. **[Instagram Core Integration](./instagram.md)**
   * Endpoints for connecting an Instagram account via Meta OAuth, fetching basic profile data, and retrieving a paginated list of media posts.
3. **[Analytics & Insights](./insights.md)**
   * Endpoints for the analytics dashboard. Includes pre-computed dashboard aggregates, detailed time-series demographic data, per-post media insights, active stories, and the background synchronization trigger.

## 🩺 Health Check

A lightweight, unauthenticated health probe is available for uptime monitoring and readiness checks.

* **URL:** `/api/health`
* **Method:** `GET`
* **Requires Auth:** No

### Response (200 OK)
Reports overall service status and ClickHouse connectivity.

```json
{
  "status": "ok",
  "database": true
}
```

If ClickHouse is unreachable, `status` becomes `"degraded"` and `database` becomes `false` — the endpoint itself still returns `200 OK`.

---

## 🛠️ Error Handling

The API returns standard HTTP status codes. Errors will typically follow this JSON structure:

```json
{
  "detail": "A human readable error message explaining what went wrong."
}
```

`5xx` responses are intentionally generic (`"An internal error occurred"`) to avoid leaking internal details; the underlying exception is logged server-side.

### Status Code Map

The backend maps each domain exception to a specific HTTP status code via a central handler. The table below is the source-of-truth mapping (see `app/exception_handlers.py`).

| Status                          | Trigger                                                              |
|---------------------------------|----------------------------------------------------------------------|
| **200 OK**                      | Request succeeded                                                    |
| **201 Created**                 | Resource was created (e.g., `POST /api/auth/register`)               |
| **400 Bad Request**             | OAuth flow failed (`OAuthError`) or request validation failed        |
| **401 Unauthorized**            | Missing/invalid/expired JWT or invalid login credentials             |
| **403 Forbidden**               | Account disabled (`AccountDisabledError`)                            |
| **404 Not Found**               | Resource not found, **or** no Instagram account connected for user   |
| **409 Conflict**                | Duplicate entity (e.g., email already registered)                    |
| **422 Unprocessable Entity**    | Pydantic body/query validation error                                 |
| **500 Internal Server Error**   | Unhandled exception                                                  |
| **502 Bad Gateway**             | Upstream Meta/Instagram Graph API call failed (`InstagramAPIError`)  |
| **503 Service Unavailable**     | ClickHouse / database unavailable (`DatabaseError`)                  |

> **Note on `404` for Instagram routes:** when a user hasn't completed the OAuth flow, protected Instagram endpoints raise `InstagramNotConnectedError` which maps to `404`. The frontend should treat this as a signal to send the user to `/connect`, not as a permanent missing-resource error.

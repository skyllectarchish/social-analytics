# Social Analytics API Documentation

Welcome to the backend API documentation for the Social Analytics platform. This documentation is designed to be easily readable by both human developers and AI coding agents to facilitate seamless frontend integration.

## 🔗 Base URL
All API requests should be prefixed with your backend's base URL (e.g., `http://localhost:8000`).

## 🔐 Authentication
Most endpoints require authentication. The backend uses JSON Web Tokens (JWT).
When an endpoint states `Requires Auth: Yes`, you must include the token in the `Authorization` header of your HTTP request.

**Format:**
```http
Authorization: Bearer <your_jwt_token>
```

## 📚 API Categories

The API is divided into three main categories. Click on the links below to view the detailed endpoint documentation, complete with sample payloads and expected responses.

1. **[Authentication & Users](./auth.md)**
   * Endpoints for user registration, login, and fetching the current user profile.
2. **[Instagram Core Integration](./instagram.md)**
   * Endpoints for connecting an Instagram account via Meta OAuth, fetching basic profile data, and retrieving a paginated list of media posts.
3. **[Analytics & Insights](./insights.md)**
   * Endpoints for the analytics dashboard. Includes pre-computed dashboard aggregates, detailed time-series demographic data, per-post media insights, active stories, and the background synchronization trigger.

---

## 🛠️ Error Handling

The API returns standard HTTP status codes. Errors will typically follow this JSON structure:

```json
{
  "detail": "A human readable error message explaining what went wrong."
}
```

### Common Status Codes
* **200 OK**: Request succeeded.
* **201 Created**: Resource was successfully created (e.g., Registration).
* **400 Bad Request**: Invalid input or parameters.
* **401 Unauthorized**: Missing or invalid JWT token.
* **403 Forbidden**: Token is valid, but the user doesn't have permission (or Instagram is not connected).
* **404 Not Found**: Resource doesn't exist.
* **429 Too Many Requests**: Rate limit exceeded (especially relevant for Instagram sync).
* **500 Internal Server Error**: An unexpected backend issue occurred.

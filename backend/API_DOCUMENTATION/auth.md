# Authentication & Users API

This document details the endpoints required for user registration, authentication, and session management.

All routes are mounted under the prefix `/api/auth`.

---

## 1. Register User
Creates a new user account and returns an access token for immediate login. No second login round-trip is needed.

* **URL:** `/api/auth/register`
* **Method:** `POST`
* **Requires Auth:** No

### Request Body (JSON)
```json
{
  "email": "creator@example.com",
  "username": "creator_name",
  "password": "securepassword123"
}
```

### Validation Rules
The backend rejects the request with `422 Unprocessable Entity` if any of these are violated:

| Field      | Rule                                                                                         |
|------------|----------------------------------------------------------------------------------------------|
| `email`    | Must be a syntactically valid email address (`pydantic.EmailStr`).                           |
| `username` | 3–30 characters, leading/trailing whitespace stripped. May only contain `[a-zA-Z0-9_.-]`.    |
| `password` | Minimum 8 characters. Stored using bcrypt — never returned by the API.                       |

### Response (201 Created)
Returns a JWT access token and the created user's basic profile.

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "e9b5e5f3-1f4f-41fc-b1ac-daf3f2a1b9c8",
    "email": "creator@example.com",
    "username": "creator_name",
    "is_active": true
  }
}
```

### Error Responses
* **409 Conflict** — A user with this email already exists.
* **422 Unprocessable Entity** — Body failed Pydantic validation (see rules above).

---

## 2. Login User
Authenticates an existing user using their email and password.

* **URL:** `/api/auth/login`
* **Method:** `POST`
* **Requires Auth:** No

### Request Body (JSON)
```json
{
  "email": "creator@example.com",
  "password": "securepassword123"
}
```

### Response (200 OK)
Returns a JWT access token and the user's basic profile. The shape matches `/register`.

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "e9b5e5f3-1f4f-41fc-b1ac-daf3f2a1b9c8",
    "email": "creator@example.com",
    "username": "creator_name",
    "is_active": true
  }
}
```

### Error Responses
* **401 Unauthorized** — Invalid credentials (unknown email or wrong password). The API does not distinguish between the two, by design.
* **403 Forbidden** — Account is disabled (`is_active = false`).

---

## 3. Get Current User (Me)
Retrieves the profile information of the currently authenticated user based on their JWT token. Useful for validating sessions on frontend load (e.g., on app start, hydrate auth state by calling this).

* **URL:** `/api/auth/me`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Response (200 OK)
```json
{
  "id": "e9b5e5f3-1f4f-41fc-b1ac-daf3f2a1b9c8",
  "email": "creator@example.com",
  "username": "creator_name",
  "is_active": true
}
```

### Error Responses
* **401 Unauthorized** — Token is malformed, expired, or missing its `sub` claim (`AuthenticationError`).
* **403 Forbidden** — The `Authorization` header is missing entirely (FastAPI's `HTTPBearer` default behavior).
* **404 Not Found** — The token is valid but the user it references no longer exists (`EntityNotFoundError`).

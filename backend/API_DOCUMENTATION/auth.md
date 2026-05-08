# Authentication & Users API

This document details the endpoints required for user registration, authentication, and session management.

---

## 1. Register User
Creates a new user account and returns an access token for immediate login.

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
Returns a JWT access token to be used for subsequent authenticated requests.

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
* **401 Unauthorized:** Invalid credentials (incorrect email or password).
* **403 Forbidden:** Account is disabled.

---

## 3. Get Current User (Me)
Retrieves the profile information of the currently authenticated user based on their JWT token. Useful for validating sessions on frontend load.

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
* **401 Unauthorized:** Missing or expired JWT token.

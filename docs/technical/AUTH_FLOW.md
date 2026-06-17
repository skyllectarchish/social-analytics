# AUTH_FLOW.md

> Authentication, session, OAuth, and authorization — traced end to end with `file:line` references.

---

## 1. Mechanisms at a glance

| Concern | Implementation | Where |
|---|---|---|
| App login | JWT bearer (HS256), `python-jose` | `auth/service.py:22` |
| Password hashing | bcrypt cost 12, `passlib` | `auth/service.py:11` |
| Session restore | `GET /api/auth/me` on app load | `context/AuthContext.tsx:26` |
| Token storage (client) | `localStorage["access_token"]` | `api/client.ts:4` |
| Token injection | axios request interceptor → `Authorization: Bearer` | `api/client.ts:17` |
| 401 handling | clear token + redirect `/login?next=…` | `api/client.ts:54` |
| Protected routes | `ProtectedRoute` wrapper | `App.tsx:48` |
| Protected API | `Depends(get_current_user)` | `auth/dependencies.py:20` |
| IG OAuth | Instagram Login API + signed state JWT | `instagram/service.py` |
| YouTube OAuth | Google OAuth 2.0 + signed state JWT | `youtube/service.py` |
| Token-at-rest | Fernet, key = SHA-256(`JWT_SECRET_KEY`) | `crypto.py:12` |

There is **no refresh-token endpoint and no logout endpoint** server-side. Access tokens are valid until `exp` (default 24h, `JWT_EXPIRATION_MINUTES=1440`). Logout is purely client-side (`tokenStore.clear()`).

---

## 2. Registration flow

```
RegisterPage (email, username, password)
  → useAuth().register()                         AuthContext.tsx:58
  → POST /api/auth/register  {email, username, password}
        ↓ (auth/router.py:25, status 201)
     UserRegister validation:                     auth/schemas.py:10-36
        password len ≥ 8
        username 3–30, regex ^[a-zA-Z0-9_.-]+$
     email_exists? → DuplicateEntityError("User","email") → 409
     user_repo.create(..., hash_password(password))   bcrypt cost 12
     create_access_token({"sub": str(user.id)})   auth/service.py:22
  ← TokenResponse {access_token, token_type:"bearer", user}
  → storeSession: tokenStore.set + setUser        AuthContext.tsx:46
  → navigate to /dashboard
```

`hash_password` uses `CryptContext(schemes=["bcrypt"], bcrypt__rounds=12)` (`auth/service.py:11`).

---

## 3. Login flow

```
LoginPage (email, password)
  → useAuth().login()                             AuthContext.tsx:52
  → POST /api/auth/login  {email, password}
        ↓ (auth/router.py:48)
     find_by_email
        if None → verify_password(_BOGUS_PASSWORD_HASH) then AuthenticationError  (timing-equalized)
        if bad pw → AuthenticationError → 401
        if not is_active → AccountDisabledError → 403
     create_access_token({"sub": str(user.id)})
  ← TokenResponse
  → storeSession → navigate (honors ?next=)
```

**Timing-attack mitigation:** a module-level `_BOGUS_PASSWORD_HASH = hash_password("not-a-real-password")` (`auth/router.py:22`) is verified even when the email doesn't exist, so login latency doesn't reveal account existence.

---

## 4. JWT details

**Creation** (`auth/service.py:22-29`): claims `sub` (user id, supplied by caller), `iat`, `nbf` (both now, UTC), `exp` (now + `jwt_expiration_minutes`). Signed HS256 with `settings.jwt_secret_key`.

**Decode** (`auth/service.py:32-40`): `jwt.decode(..., options={"require": ["sub","exp"]})` — rejects tokens lacking `sub` or `exp`; `nbf`/`iat` auto-validated.

**Secret validation at startup** (`config.py:141-155`): rejects the `.env.example` placeholder and requires length ≥ 32.

---

## 5. `get_current_user` dependency

`auth/dependencies.py:20-54`:
```
HTTPBearer extracts "Authorization: Bearer <token>"   (:17)
  → decode_token(token) → payload
  → sub = payload["sub"]
  → if not isinstance(sub,str) or not sub → AuthenticationError("Token missing subject claim")  (:35) — type guard
  → user = user_repo.find_by_id(get_client(), sub)
  → if None → EntityNotFoundError("User") → 404
  → return User dataclass                              (:54)
```
Error mapping: `JWTError` → `AuthenticationError("Invalid or expired token")` → 401; any other exception → `AuthenticationError`. Routes consume `current_user.id` / `.to_response_dict()` and scope all queries by it.

> ⚠ Doc drift: CLAUDE.md says this returns a dict; it returns a frozen `User` dataclass.

---

## 6. Login/session sequence diagram

```
Browser            FastAPI                 ClickHouse
  │  POST /auth/login {email,pw}              │
  ├──────────────────────────────►│           │
  │                    find_by_email          │
  │                    ├──────────────────────►│
  │                    │◄── user row ──────────┤
  │                    verify_password(bcrypt) │
  │                    create_access_token     │
  │◄── 200 {access_token, user} ──┤            │
  │  tokenStore.set("access_token")            │
  │                                            │
  │  (every later request)                     │
  │  GET /api/... Authorization: Bearer <jwt>  │
  ├──────────────────────────────►│           │
  │                    get_current_user        │
  │                    decode JWT → find_by_id │
  │                    ├──────────────────────►│
  │◄── 200 data ──────┤                        │
  │                                            │
  │  (app reload)  GET /auth/me                │
  ├──────────────────────────────►│           │
  │◄── 200 UserResponse (or 401 → clear+login)│
```

---

## 7. Instagram OAuth (Instagram Login API — no Facebook Page walk)

```
1. ConnectInstagramPage → GET /api/instagram/connect              instagram/router.py:191
     create_signed_oauth_state(user_id, purpose="ig_oauth_state")  oauth_state.py:12
        JWT claims: uid, nonce(token_urlsafe), exp(+600s), purpose; signed w/ JWT_SECRET_KEY
     get_oauth_url(state) → https://www.instagram.com/oauth/authorize
        client_id=META_APP_ID, redirect_uri=META_REDIRECT_URI,
        scope=instagram_business_basic,..._manage_insights,..._manage_comments,..._manage_messages
   ← {oauth_url, state} → browser redirects to Instagram

2. Instagram → redirect to META_REDIRECT_URI ?code=&state=
     CallbackPage → GET /api/instagram/callback?code&state        router.py:203

3. verify_oauth_state(state, user_id)  — checks signature, purpose, uid match  oauth_state.py:24 (CSRF)
   exchange_code_for_token(code)  POST https://api.instagram.com/oauth/access_token   service.py:64
        → (short_token, ig_user_id)   ← single response carries both (no /me/accounts walk)
   get_long_lived_token(short_token)  GET graph.instagram.com/access_token?grant_type=ig_exchange_token  service.py:100
        → (long_token, expires_in≈5184000s/60d)
   fetch_profile + fetch_media (paginated)                         service.py:272, 292
   encrypt_token(long_token, JWT_SECRET_KEY) → instagram_repo.upsert_profile  router.py:245
   background_tasks: _run_insights_sync                            router.py:255
   ← CallbackResponse {success, profile}
```

- **Idempotency guard** (`router.py:224-238`): a re-fired callback with a spent code, when a profile already exists, short-circuits to success rather than erroring.
- **Decrypt failure** (`_decrypt_access_token`, `router.py:172`): corrupt ciphertext or a rotated `JWT_SECRET_KEY` raises `InstagramNotConnectedError` (404 → frontend routes to `/connect`), never a 500.
- **`/refresh`** (`router.py:470`) re-fetches profile+media with the stored token but keeps the real expiry unchanged. Token renewal proper (`service.refresh_long_lived_token`, Meta `ig_refresh_token` grant) is only invoked by the `account_sync` job.

---

## 8. YouTube OAuth (Google OAuth 2.0)

```
YoutubeConnectPage → GET /api/youtube/connect                     youtube/router.py:56
   create_signed_oauth_state(user_id, purpose="yt_oauth_state")
   dialog: https://accounts.google.com/o/oauth2/v2/auth
      scopes: youtube.readonly, yt-analytics.readonly, youtube.force-ssl
      access_type=offline, prompt=consent  (forces refresh-token issuance)
YoutubeCallbackPage → GET /api/youtube/callback?code&state        router.py:63
   verify_oauth_state(...)  (CSRF)
   exchange_code_for_tokens(code) POST https://oauth2.googleapis.com/token  service.py:44
      → (access_token, refresh_token)
   encrypt_token(refresh_token, JWT_SECRET_KEY) → youtube_tokens   router.py:86
      (only the refresh token is stored; access tokens re-minted on demand)
   fetch_channel + fetch_latest_videos → bg analytics sync
```
**Graceful fallback** (`router.py:78-84`): on `OAuthError`, if a channel already exists it returns the stored channel (handles Google omitting a refresh_token on re-consent).

---

## 9. Frontend route protection & 401 handling

- **`ProtectedRoute`** (`App.tsx:48`): while `loading` → `Splash`; if no `user` → `Navigate` to `/login` (or `/login?next=<encoded path>`, guarded against `//` open-redirect).
- **`GuestRoute`** (`:61`): authed users bounced to `/dashboard`.
- **Axios 401 interceptor** (`client.ts:54-63`): clears the token and `window.location.assign("/login?next=…")` unless already on `/login`.
- **AuthContext restore** (`AuthContext.tsx:26-44`): on mount, if a token exists, `GET /auth/me`; on success set `user`, on failure clear token. Always clears `loading` in `finally`.

`AuthContext` exposes `login`, `register`, `logout` — **no `refresh`** (none exists) and **no token in React state** (token lives only in `localStorage`).

---

## 10. Authorization model

There are **no roles** in the app. Authorization is **tenant isolation**: every protected query is parameterized by `current_user.id`, and lookups of child resources (a comment, a competitor, a funnel) are user-scoped, so a foreign id simply doesn't resolve (e.g. comment-reply ownership via `comment_repo.find_comment_with_context`, `router.py:927`).

The only privileged surface is the **admin router** (`/api/admin/ai-cost`), gated by an `X-Admin-Key` header compared in constant time (`secrets.compare_digest`) and **only mounted when `ADMIN_API_KEY` is set** (`main.py:67`, `ai/admin.py:39`).

> See `SECURITY_AUDIT.md` for the single-secret reuse concern and the unauthenticated YouTube webhook.

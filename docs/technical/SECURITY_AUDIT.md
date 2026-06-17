# SECURITY_AUDIT.md

> Static security review of the audited code. Each finding: **Severity · Evidence · Recommendation.** Scope: authentication, secrets, external API usage, injection surfaces, authorization. No dynamic testing was performed.

---

## High severity

### S1 — YouTube webhook has no signature verification
- **Evidence:** `youtube/webhook.py:59` (`POST /api/youtube/webhook/receive`) is intentionally public and parses Atom XML, but does **not** validate any `hub.secret`/`X-Hub-Signature` HMAC — no secret is sent on subscribe (`service.py:328`).
- **Risk:** any unauthenticated party who learns the public callback URL can POST forged Atom XML naming an arbitrary `channel_id`, triggering DB writes (`youtube_title_history`) and background jobs (preflight LLM call, golden-hour, velocity checks) for whichever user owns/tracks that channel. Amplification + spoofed-data vector. This is the most significant gap found.
- **Recommendation:** send `hub.secret` on subscribe and verify the HMAC-SHA1 `X-Hub-Signature` on every `/receive` POST; reject mismatches. Add a body-size cap.

### S2 — Single secret reused for three cryptographic purposes
- **Evidence:** `JWT_SECRET_KEY` signs auth JWTs (`auth/service.py:29`), signs OAuth-state JWTs (`oauth_state.py:21`), and is the source secret for Fernet token encryption (`crypto.py:12`, callers in `instagram/router.py:245`, `youtube/router.py:86`).
- **Risk:** compromise of one secret simultaneously breaks login forgery protection, OAuth CSRF protection, **and** confidentiality of stored Instagram/YouTube long-lived tokens. Rotation is also coupled — rotating the JWT secret invalidates every stored API token (forces re-OAuth for all users).
- **Recommendation:** use separate keys — `JWT_SECRET_KEY`, `OAUTH_STATE_SECRET`, and a dedicated `TOKEN_ENCRYPTION_KEY` (ideally a real Fernet key or KMS-managed). Document rotation procedure.

---

## Medium severity

### S3 — Token encryption key derived via bare SHA-256 (no KDF/salt)
- **Evidence:** `crypto.py:12` — `base64.urlsafe_b64encode(sha256(secret).digest())`; no salt, no slow KDF.
- **Risk:** acceptable only because the input is a high-entropy 32+ char secret; offers no defense if the secret is weak. Combined with S2, DB-read + secret = plaintext tokens.
- **Recommendation:** at minimum keep the ≥32-char enforcement (already present, `config.py:141`); ideally manage the encryption key via a secrets manager and rotate independently of the JWT secret.

### S4 — Autonomous DM sending to real followers
- **Evidence:** `jobs/dm_funnel_runner.py` runs every 15 min, sending DMs via Meta's private-reply API (`service.send_private_reply`) for comments matching a user-defined keyword. Guards: word-boundary match, 7-day reply window, dedup ledger, `dm_funnel_max_sends_per_run=25`, 0.2s spacing.
- **Risk:** a misconfigured/abusive keyword could mass-DM followers within Meta's per-comment-once limit; reputational/ToS risk, and the feature acts on the user's behalf without per-send confirmation.
- **Recommendation:** add an explicit per-funnel enable confirmation, a global daily cap, an audit/preview mode, and surface every send in the activity feed (the `dm_funnel_sends` ledger already exists — ensure it's user-visible).

### S5 — OAuth state has no replay protection
- **Evidence:** `oauth_state.py:16` mints a `nonce` but never stores/checks it; replay is bounded only by the 600s TTL and the `uid`/`purpose` claim match.
- **Risk:** low — a captured state is reusable within 10 minutes but is bound to the same user and purpose.
- **Recommendation:** if hardening is desired, persist used nonces (short TTL set) and reject reuse.

### S6 — No token revocation / no logout endpoint
- **Evidence:** no `/logout` or blacklist; tokens valid until `exp` (default 24h). Logout is client-side only (`AuthContext.logout` clears localStorage).
- **Risk:** a leaked token can't be invalidated before expiry.
- **Recommendation:** add a server-side revocation list (or short access tokens + refresh tokens) if the threat model requires immediate revocation.

### S7 — Insecure HTTP in archive miner
- **Evidence:** `jobs/yt_archive_miner.py:56` calls `http://suggestqueries.google.com/...` (cleartext).
- **Risk:** MITM tampering of trend signals; low data sensitivity but unnecessary.
- **Recommendation:** use `https://`.

---

## Low severity / informational

### S8 — Graph DSL injection surface (mitigated)
- **Evidence:** competitor handle is interpolated into Meta's `business_discovery.username(...)` Graph DSL (`competitors.py:65`).
- **Mitigation present:** double validation — Pydantic `pattern=^[A-Za-z0-9._]+$` at the router and `_HANDLE_RE` in the service (`competitors.py:33`). Branded hashtags similarly pattern-validated.
- **Status:** adequately defended; keep the regexes if the DSL usage remains.

### S9 — Plaintext IG credentials if private-API trending is ever enabled
- **Evidence:** `trending_live.py` (instagrapi, private `/api/v1/music/trending/`) reads `IG_TRENDING_USERNAME`/`IG_TRENDING_PASSWORD` from `.env`.
- **Status:** **disabled by default** (`ig_trending_enabled=False`), never runs in the API process, not wired to any endpoint; the served `/trending-audio` uses only the curated DB list (consistent with the product decision to avoid ban risk). Leave disabled.

### S10 — CORS is credentialed with a single explicit origin (good)
- **Evidence:** `main.py:49` — `allow_origins=[settings.frontend_url]`, `allow_credentials=True`, wildcard methods/headers. Because the origin is explicit (not `*`), credentialed CORS is valid.
- **Status:** correct; ensure `FRONTEND_URL` is set to the real production origin.

### S11 — Image proxy is not an open proxy (good)
- **Evidence:** `/media/{id}/image` (`router.py:360`) fetches only URLs already stored for the **authenticated user's own** media, looked up by `(user_id, ig_media_id)` — never a caller-supplied URL; returns `Cache-Control: private`.
- **Status:** correct design.

---

## Strengths observed
- Parameterized SQL throughout (`{name:Type}` placeholders) — no value interpolation into queries.
- bcrypt cost 12; JWT requires `sub`+`exp`; login timing-attack mitigation (`_BOGUS_PASSWORD_HASH`).
- 5xx error messages masked to clients (`exception_handlers.py:61`); credential-redaction log filter covers tokens/Bearer/secrets/auth codes (`logging_config.py`).
- Admin router gated behind a non-empty key compared with `secrets.compare_digest`.
- OAuth CSRF via signed, user-bound, short-TTL state JWTs; decrypt failures degrade to reconnect, never 500.
- Tenant isolation: all queries scoped by `user_id`; foreign resource ids simply don't resolve.

---

## Prioritized remediation
1. **S1** — add WebSub HMAC verification (highest impact, public unauthenticated surface).
2. **S2/S3** — split the three secret roles; manage the token-encryption key separately.
3. **S4** — DM automation guardrails (daily cap, confirmation, visible audit).
4. **S6/S5** — token revocation + nonce replay protection (if threat model warrants).
5. **S7** — switch archive-miner autocomplete to HTTPS.

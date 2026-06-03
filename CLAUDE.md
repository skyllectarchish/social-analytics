# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Instagram analytics dashboard for content creators. Users register/log in, connect a Business/Creator IG account via Meta OAuth, and the backend pulls profile + media data from the Graph API and stores it in ClickHouse for long-term retention beyond Meta's native 90-day window. See `analetic-idea.md` for product motivation and `implementation_plan.md` for the original spec.

Monorepo layout: `backend/` (FastAPI + ClickHouse) and `frontend/` (React 19 + TypeScript + Vite 6 + Tailwind v4 + React Router 7 + Recharts + Framer Motion — the "InfluenceIQ" app). `frontend-old/` is the previous JavaScript frontend, kept untracked for reference only — don't edit it.

## Common commands

Backend (run from `backend/`):
```
pip install -r requirements.txt
python run_migrations.py             # apply SQL files in migrations/ in lexical order
uvicorn app.main:app --reload        # dev server on :8000
```

Frontend (run from `frontend/`):
```
npm install
npm run dev      # Vite dev server on :5173, proxies /api → http://127.0.0.1:8000
npm run build    # tsc -b && vite build (type errors fail the build)
npm run preview
```

There is currently no test suite, linter, or formatter wired up — do not invent commands for them.

Both sides require config: copy `backend/.env.example` to `backend/.env` and fill in ClickHouse Cloud creds, `JWT_SECRET_KEY`, and Meta app credentials. The backend will fail to start without `.env` because `Settings` in `app/config.py` has required fields with no defaults.

## Architecture

### Backend (`backend/app/`)

FastAPI app composed of two feature modules — `auth/` and `instagram/` — each with its own `router.py`, `schemas.py`, `service.py`. Cross-cutting modules: `config.py` (Pydantic Settings), `database.py` (ClickHouse client singleton), `models/queries.py` (centralized SQL strings).

**SQL is centralized.** All queries live in `app/models/queries.py` as parameterized strings using ClickHouse's `{name:Type}` placeholder syntax (e.g. `{user_id:String}`, `{limit:UInt32}`). When adding a query, define it there and import it into the router rather than inlining.

**ClickHouse storage model.** Tables use `ReplacingMergeTree(updated_at)` engines — inserts are append-only and deduplication happens during background merges, so reads must use `ORDER BY updated_at DESC LIMIT 1` patterns to get the latest version (see `GET_INSTAGRAM_PROFILE`, `GET_INSTAGRAM_TOKEN`). Don't expect UPDATE semantics; "updates" are new inserts with a fresher `updated_at`. Schema lives in `backend/migrations/*.sql` and is applied by `run_migrations.py` (not a real migration framework — it splits each file on `;` and runs each statement; idempotent because all DDL uses `IF NOT EXISTS`).

**Auth.** JWT bearer (HS256) via `python-jose`; passwords hashed with `passlib[bcrypt]`. `auth/dependencies.py::get_current_user` is the dependency every protected route uses; it decodes the token, fetches the user from ClickHouse, and returns a dict (`{id, email, username, is_active}`). Routes consume that dict — there is no SQLAlchemy/ORM model.

**Instagram OAuth flow** (Instagram Login API — direct, no Facebook account or Page required; in `instagram/service.py`, all routes mounted under `/api/instagram`):
1. `/connect` mints a signed JWT `state` bound to the current user (~10 min TTL) and returns an Instagram OAuth URL built from `META_APP_ID` + `META_REDIRECT_URI` + scopes `instagram_business_basic`, `instagram_business_manage_insights`, `instagram_business_manage_comments`, `instagram_business_manage_messages`. The dialog host is `https://www.instagram.com/oauth/authorize`.
2. Frontend redirects user to Instagram, Instagram redirects back to `META_REDIRECT_URI` with `?code=&state=`.
3. `/callback` verifies the signed `state` (CSRF), POSTs the code to `https://api.instagram.com/oauth/access_token` — that single response carries both the short-lived token **and** the IG user ID, so there is no `/me/accounts` Page walk. It then upgrades to a long-lived token (~60 days) via `https://graph.instagram.com/access_token?grant_type=ig_exchange_token`, fetches profile + paginated media, and stores everything in ClickHouse.
4. `/refresh` re-runs the profile/media fetch using the stored long-lived token (no new OAuth).

Graph API base is `https://graph.instagram.com` (unversioned; constant in `app/constants.py`). The flow requires the user's IG account to be a **Business or Creator** account — there is no fallback for personal accounts, but no Facebook account or Page is needed.

### Frontend (`frontend/src/`)

React 19 + TypeScript + React Router 7 ("InfluenceIQ"). Auth state is held in `context/AuthContext.tsx` (consumed via `hooks/useAuth.ts`); it restores the session with `GET /api/auth/me` on load. Access tokens live in `localStorage` (`tokenStore` in `api/client.ts`) and are injected via an axios request interceptor — the response interceptor normalizes FastAPI `detail` errors (string or 422 array → flat string) and redirects to `/login?next=…` on any 401. All API calls go through that axios instance with `baseURL: "/api"`, which the Vite dev proxy forwards to `http://127.0.0.1:8000`. `api/client.ts` also exports `safeGet<T>()` (resolves to `null` on any error so pages can fall back to mock data) and `errorMessage()`. API response types live in `api/types.ts`.

**Routing** (all in `App.tsx` — `ProtectedRoute` / `GuestRoute` / `HomeRoute` wrappers):
- `/` — landing (`components/Landing.tsx`) for guests, redirect to `/dashboard` when signed in
- `/login`, `/register` — guest-only
- `/connect` — starts IG OAuth; `/auth/instagram/callback` — exchanges `?code&state` (this path must match `META_REDIRECT_URI` in `backend/.env`)
- `/dashboard`, `/dashboard/content` (Content Lab), `/dashboard/reels` (Reels Studio), `/dashboard/audience` (Audience DNA), `/dashboard/competitors`, `/dashboard/copilot` — protected, all rendered inside `components/dashboard/DashboardLayout.tsx` (sidebar nav, profile chip, refresh/disconnect)

A 404 from `/instagram/profile` means "not connected" and routes the user to `/connect`. Pages that lack real backend data fall back to mock fixtures in `data/mock.ts` / `data/labMock.ts` (via `safeGet` returning `null`). Authed media thumbnails load through the `/instagram/media/{id}/image` proxy via `hooks/useAuthedImage.ts`.

**Design system.** One light, violet-primary (`#7c3aed`) design system shared by landing and dashboard — no scoped dual-theme split anymore. Tailwind v4 is configured CSS-first via `@import "tailwindcss"` and an `@theme inline` block in `src/index.css` (no `tailwind.config.js`); brand tokens are exposed as utilities (`violet`, `violet-deep`, `ink`, `lavender`, `mint`). Reusable CSS utilities live in `index.css`: `.glass`, `.card-hairline`, `.btn-glow`, `.chip`, `.bg-ig`/`.text-ig` (Instagram gradient), `.text-aurora`, `.num` (tabular mono digits), `.font-display`. Charts are Recharts (see `components/charts/` — `Sparkline`, `GlassTooltip`); scroll reveals use `components/ui/Reveal.tsx` and motion presets in `lib/motion.ts`. Fonts from `index.html`: Satoshi (body), Clash Display (`.font-display`, logo), Cormorant Garamond (italic serif accents), JetBrains Mono (numerals).

## Gotchas

- **lucide-react brand icons.** The installed version (0.469.0) still exports the deprecated brand icons (`Instagram` is imported in `DashboardLayout.tsx`), but upstream has removed them — don't upgrade lucide-react casually, and inline SVGs for any brand glyph the installed version lacks.
- **Tailwind v4 spacing scale.** Integer + 0.5 increments are auto-generated; `h-4.5`/`w-4.5` will silently drop. Larger arbitrary values (`py-26`, `mt-14`, etc.) work via the dynamic spacing scale. Use `size={n}` props on lucide icons for precise icon sizing instead of fractional Tailwind classes.
- **Vite optimizer cache after dep changes.** When adding new dependencies while a dev server is running, the existing `node_modules/.vite` cache can leave the page styled inconsistently. After adding deps, kill the dev server, `rm -rf node_modules/.vite`, and restart.
- **`npm run build` runs `tsc -b` first** — TypeScript errors fail the build even if Vite would accept the code. The dev server does not type-check.

## Conventions

- When adding a backend endpoint that touches ClickHouse, add the SQL to `app/models/queries.py` and use `client.query(SQL, parameters={...})` — don't string-format values into SQL.
- When adding a protected endpoint, depend on `auth.dependencies.get_current_user` and read `current_user["id"]` for scoping.
- New env vars: add to both `backend/app/config.py` (as a typed `Settings` field) and `backend/.env.example`.
- The `_client` in `database.py` is a process-wide singleton; don't instantiate `clickhouse_connect.get_client()` directly elsewhere.
- For new frontend UI, reuse the existing `index.css` utilities (`.glass`, `.card-hairline`, `.btn-glow`, `.chip`, `.text-aurora`) and motion presets in `lib/motion.ts` rather than adding new one-off styles; landing sections are one file each under `components/` composed in `Landing.tsx`.
- New dashboard pages render inside `DashboardLayout` and get a route + sidebar entry (the `NAV` array in `DashboardLayout.tsx`).

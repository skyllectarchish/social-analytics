# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Instagram analytics dashboard for content creators. Users register/log in, connect a Business/Creator IG account via Meta OAuth, and the backend pulls profile + media data from the Graph API and stores it in ClickHouse for long-term retention beyond Meta's native 90-day window. See `analetic-idea.md` for product motivation and `implementation_plan.md` for the original spec.

Monorepo layout: `backend/` (FastAPI + ClickHouse) and `frontend/` (React 19 + Vite 6 PWA + Tailwind v4 + Framer Motion).

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
npm run dev      # Vite dev server on :5173, proxies /api → http://localhost:8000
npm run build
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

**Instagram OAuth flow** (in `instagram/service.py`, all routes mounted under `/api/instagram`):
1. `/connect` returns a Meta OAuth URL (built from `META_APP_ID` + `META_REDIRECT_URI` + scopes including `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `instagram_manage_insights`, `business_management`).
2. Frontend redirects user to Meta, Meta redirects back to `META_REDIRECT_URI` with `?code=`.
3. `/callback` exchanges code → short-lived token → long-lived token (~60 days) → discovers the IG Business Account ID by walking `/me/accounts` for a Page with `instagram_business_account` set → fetches profile and paginated media → stores everything in ClickHouse.
4. `/refresh` re-runs the fetch using the stored long-lived token (no new OAuth).

Graph API base is `https://graph.facebook.com/v25.0` (constant in `instagram/service.py`). The flow requires the user's IG account to be a Business/Creator account linked to a Facebook Page — there is no fallback for personal accounts.

### Frontend (`frontend/src/`)

React 19 + React Router 7. Auth state is held in `context/AuthContext.jsx`; protected/guest routes are wrappers in `App.jsx`. Access tokens are stored in `localStorage` and injected via an axios interceptor in `api/client.js` — the same interceptor redirects to `/login` on any 401. All API calls go through that axios instance with `baseURL: "/api"`, which the Vite dev proxy forwards to `http://localhost:8000`.

**Routing.** `/` is `HomeRoute` in `App.jsx`: it renders `LandingPage` for guests and redirects authenticated users to `/dashboard`. Other routes: `/login`, `/register` (both wrapped in `GuestRoute`), `/connect`, `/callback`, `/dashboard` (all wrapped in `ProtectedRoute`). The OAuth callback page reads `?code=` from the URL and POSTs it to `/api/instagram/callback`.

Tailwind v4 is configured CSS-first via `@import "tailwindcss"` and an `@theme` block in `src/index.css` — there is no `tailwind.config.js`. The Vite plugin `@tailwindcss/vite` handles the build. PWA manifest + service worker come from `vite-plugin-pwa` configured in `vite.config.js`.

### Landing page (`frontend/src/components/landing/`)

The landing page has its **own design system, fonts, and visual language** distinct from the dashboard. They share the same React app and `index.css`, kept compatible by scoping.

- **Scoped wrapping.** `LandingPage.jsx` wraps everything in `<div className="lumen-landing">`. All landing-only CSS (light theme colors, glassmorphism, mesh gradients, premium typography) lives under that selector or under classes only the landing uses (`.glass`, `.glass-strong`, `.glass-subtle`, `.text-gradient-aurora`, `.btn-primary-glow`, `.chip-soft`, `.grid-pattern`, `.aurora-bg`, `.divider-glow`, etc.). The existing dashboard styles (the `@theme` `--color-primary*` tokens, dark `body` background) are untouched. **Don't bleed landing classes into dashboard pages, or vice versa.**
- **Body background swap.** `LandingPage`'s `useEffect` sets `document.body.style.backgroundColor = "#fafafb"` on mount and restores it on unmount, because the dashboard expects a dark body and the landing expects light. Keep this if the landing is mounted/unmounted from a multi-route app.
- **Component layout.**
  - `components/landing/background/` — `GradientMesh`, `Spotlight` (cinematic top light)
  - `components/landing/hero/` — `DashboardMockup` (the realistic in-product hero centerpiece — chrome bar + sidebar + main canvas with chart/KPIs/reels)
  - `components/landing/sections/` — one file per section (`HeroSection`, `FeaturesSection`, `AnalyticsPreview`, `CommunityShowcase`, `TrendingAudio`, `TipsSection`, `HowItWorks`, `PricingSection`, `TestimonialCarousel`, `CTASection`, `LandingFooter`, `SocialProofSection`, `LandingNav`)
  - `components/landing/ui/` — reusable primitives: `GlassCard` (3D-tilt frosted glass), `MagneticButton` (`primary`/`gradient`/`ghost` variants), `AnimatedCounter`, `SectionHeading`
- **Animations.** Framer Motion + CSS keyframes defined in `index.css` (`orbFloat`, `orbFloatSm`, `pulseGlow`, `meshShift`, `shimmer`, `marquee`, `waveform`, `drawLine`, `gradientText`). Reuse the existing keyframes before adding new ones.
- **Fonts.** `index.html` loads **Clash Display + Satoshi + Cabinet Grotesk** from Fontshare and Inter from Google Fonts. CSS variables in `@theme`: `--font-display` (Clash Display, used via `.font-display` and tightened `tracking-[-0.04em]`), `--font-sans` (Satoshi for landing body via `.lumen-landing` selector), `--font-sans` falls back to Inter for the dashboard.

## Gotchas

- **lucide-react brand icons.** The version installed (and current upstream) does **not** export `Instagram`, `Twitter`, `Youtube`, `Linkedin`, or `Github` — they were dropped. `LandingFooter.jsx` inlines them as small SVG components; mirror that approach if you need other brand glyphs. Other lucide icons (`Sparkles`, `Heart`, `TrendingUp`, etc.) are fine.
- **Tailwind v4 spacing scale.** Integer + 0.5 increments are auto-generated; `h-4.5`/`w-4.5` will silently drop. Larger arbitrary values (`py-26`, `mt-14`, etc.) work via the dynamic spacing scale. Use `size={n}` props on lucide icons for precise icon sizing instead of fractional Tailwind classes.
- **Vite optimizer cache after dep changes.** When adding new dependencies (e.g. `framer-motion`, `lucide-react`) while a dev server is running, the existing `node_modules/.vite` cache can leave the page styled inconsistently. After adding deps, kill the dev server, `rm -rf node_modules/.vite`, and restart.

## Conventions

- When adding a backend endpoint that touches ClickHouse, add the SQL to `app/models/queries.py` and use `client.query(SQL, parameters={...})` — don't string-format values into SQL.
- When adding a protected endpoint, depend on `auth.dependencies.get_current_user` and read `current_user["id"]` for scoping.
- New env vars: add to both `backend/app/config.py` (as a typed `Settings` field) and `backend/.env.example`.
- The `_client` in `database.py` is a process-wide singleton; don't instantiate `clickhouse_connect.get_client()` directly elsewhere.
- For new landing sections, compose existing primitives (`GlassCard`, `MagneticButton`, `SectionHeading`) and reuse the existing CSS keyframes; avoid adding scattered floating chips/ornaments — the established pattern is one focused composition per section, with at most 1–2 intentional floating overlay cards.

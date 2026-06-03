# InfluenceIQ

Premium Instagram-analytics web app — a polished marketing landing page **plus** a
functional authenticated dashboard wired to the project's FastAPI backend.

React 19 · Vite 6 · TypeScript · Tailwind v4 · React Router 7 · Recharts · Framer Motion · lucide-react · axios

## Run (frontend + backend together)

The frontend proxies `/api` → `http://127.0.0.1:8000`, so run the backend first.

```bash
# 1) backend (from repo root → backend/)
cd ../backend
uvicorn app.main:app --reload        # serves on :8000 (needs backend/.env)

# 2) frontend (this folder)
npm install
npm run dev                          # http://localhost:5173
npm run build                        # tsc -b && vite build
```

> The OAuth redirect URI is `http://localhost:5173/auth/instagram/callback`
> (matches `META_REDIRECT_URI` in `backend/.env.example`), so the Instagram
> connect flow works when the app runs on :5173.

## Routes

| Route | Guard | Purpose |
|-------|-------|---------|
| `/` | public | Marketing landing (redirects to `/dashboard` when signed in) |
| `/login` | guest-only | Email + password → `POST /api/auth/login` |
| `/register` | guest-only | `POST /api/auth/register` → `/connect` |
| `/connect` | protected | Starts IG OAuth: `GET /api/instagram/connect` → Instagram |
| `/auth/instagram/callback` | protected | Exchanges `?code&state` via `GET /api/instagram/callback` |
| `/dashboard` | protected | Profile, KPIs, reach chart, top posts, recent media |

## Backend integration

- **`src/api/client.ts`** — axios instance (`baseURL: /api`), injects the JWT
  bearer, normalizes FastAPI `detail` errors, redirects to `/login` on 401.
- **`src/context/AuthContext.tsx`** — `login` / `register` / `logout`, restores
  the session via `GET /api/auth/me` on load. Token in `localStorage`.
- **`src/App.tsx`** — `BrowserRouter` + `ProtectedRoute` / `GuestRoute` / `HomeRoute`.
- **Dashboard** consumes `/instagram/profile`, `/instagram/insights/dashboard`,
  `/instagram/insights/overview`, `/instagram/media`, and `POST /instagram/refresh`
  + `/instagram/insights/sync`. Thumbnails load through the authed
  `/instagram/media/{id}/image` proxy via `useAuthedImage`.

A 404 from `/instagram/profile` (`InstagramNotConnectedError`) routes the user to
`/connect`.

## Design system

Matched to `influence-iq-lab.lovable.app`: violet primary (`#7c3aed`),
animated aurora gradients, `.card-hairline` / `.btn-glow` / `.chip` / `.bg-ig`
utilities, Satoshi headings + Clash Display logo + Cormorant Garamond italic
accents. See `src/index.css`.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { YoutubeConnectResponse } from "../api/youtubeTypes";
import { useAuth } from "../hooks/useAuth";

function YTIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.8 15.5V8.5l6.3 3.5-6.3 3.5Z" />
    </svg>
  );
}

export default function YoutubeConnectPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.get<YoutubeConnectResponse>("/youtube/connect");
      sessionStorage.setItem("yt_oauth_state", data.state);
      window.location.href = data.oauth_url;
    } catch (err) {
      setError(errorMessage(err, "Could not start the YouTube connection"));
      setBusy(false);
    }
  }

  const benefits = [
    "Retention curves saved beyond YouTube Studio limits",
    "AI drop-off explanations per video",
    "Daily metrics in one dashboard with Instagram",
  ];

  return (
    <div className="aurora-scene grain relative grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="card-hairline p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ig text-white">
            <YTIcon className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Connect your YouTube Channel
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-foreground/65">
            {user?.username ? `Hi ${user.username} — ` : ""}link your channel via Google OAuth to unlock analytics you can't get in YouTube Studio.
          </p>

          <ul className="mt-5 space-y-2 text-left">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-deep" />
                {b}
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={connect}
            disabled={busy}
            className="btn-glow mt-6 w-full disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <YTIcon className="h-4 w-4" />}
            {busy ? "Redirecting…" : "Connect with Google"}
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="mt-3 text-sm font-medium text-foreground/60 hover:text-foreground"
          >
            I'll do this later &rarr;
          </button>
        </div>

        <button
          onClick={logout}
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-foreground/55 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}

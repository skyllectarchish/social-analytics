import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Instagram, Loader2, LogOut } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { ConnectResponse } from "../api/types";
import { useAuth } from "../hooks/useAuth";

export default function ConnectInstagramPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.get<ConnectResponse>("/instagram/connect");
      // Persist the CSRF state so the callback can echo it back to the API.
      sessionStorage.setItem("ig_oauth_state", data.state);
      window.location.href = data.oauth_url;
    } catch (err) {
      setError(errorMessage(err, "Could not start the Instagram connection"));
      setBusy(false);
    }
  }

  return (
    <div className="aurora-scene grain relative grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="card-hairline p-8 text-center">
          <div className="bg-ig mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white">
            <Instagram className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Connect your Instagram
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-foreground/65">
            {user?.username ? `Hi ${user.username} — ` : ""}link a Business or Creator
            account to pull your profile, media and insights. One click, official Graph
            API, no scraping.
          </p>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <button onClick={connect} disabled={busy} className="btn-glow mt-6 w-full disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
            {busy ? "Redirecting…" : "Connect Instagram"}
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="mt-3 text-sm font-medium text-foreground/60 hover:text-foreground"
          >
            I'll do this later →
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

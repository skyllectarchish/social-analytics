import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../hooks/useAuth";

export default function ConnectInstagramPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/instagram/connect");
      window.location.href = data.oauth_url;
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to initiate connection");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "oklch(0.12 0.02 275)" }}>
      <div className="w-full max-w-lg animate-fade-in text-center">
        <div className="rounded-2xl p-10"
          style={{ background: "oklch(0.18 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)" }}>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6"
            style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: "oklch(0.95 0.01 275)" }}>
            Connect Instagram
          </h1>
          <p className="mb-2" style={{ color: "oklch(0.65 0.02 275)" }}>
            Hi, <span style={{ color: "oklch(0.80 0.15 275)" }}>{user?.username}</span>
          </p>
          <p className="text-sm mb-8" style={{ color: "oklch(0.65 0.02 275)" }}>
            Link your Instagram Business or Creator account to start tracking analytics.
          </p>

          <div className="rounded-xl p-4 mb-8 text-left text-sm space-y-2"
            style={{ background: "oklch(0.12 0.02 275)", border: "1px solid oklch(0.30 0.04 275)" }}>
            <p className="font-medium mb-3" style={{ color: "oklch(0.80 0.02 275)" }}>Required permissions:</p>
            {["instagram_basic — view profile & media", "pages_show_list — access linked Facebook Pages", "instagram_manage_insights — read analytics data"].map((p) => (
              <div key={p} className="flex items-start gap-2">
                <span style={{ color: "oklch(0.72 0.20 150)" }}>✓</span>
                <span style={{ color: "oklch(0.70 0.02 275)" }}>{p}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm mb-4" style={{ background: "oklch(0.65 0.25 25 / 0.15)", border: "1px solid oklch(0.65 0.25 25 / 0.3)", color: "oklch(0.80 0.15 25)" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleConnect} disabled={loading}
            className="w-full py-4 rounded-xl font-semibold transition-opacity"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))", color: "white", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Redirecting to Meta..." : "Connect with Instagram"}
          </button>

          <button
            onClick={logout}
            className="mt-4 text-sm hover:underline"
            style={{ color: "oklch(0.65 0.02 275)" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

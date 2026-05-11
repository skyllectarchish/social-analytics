import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";

export default function CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Connecting your Instagram account...");
  const [error, setError] = useState("");
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Instagram authorization was denied.");
      return;
    }
    if (!code) {
      setError("No authorization code received.");
      return;
    }

    (async () => {
      try {
        setStatus("Exchanging authorization code...");
        await api.get(`/instagram/callback?code=${code}`);
        setStatus("Account connected! Redirecting...");
        setTimeout(() => navigate("/dashboard"), 1000);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to connect Instagram account");
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="lumen-landing min-h-screen flex items-center justify-center px-4" style={{ background: "#fafafb" }}>
      <div className="w-full max-w-md text-center animate-fade-in">
        <div
          className="glass-strong rounded-2xl p-10"
          style={{ boxShadow: "var(--shadow-pastel)" }}
        >
          {!error ? (
            <>
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: "rgba(139,92,246,0.08)", border: "2px solid #8b5cf6" }}
              >
                <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                </svg>
              </div>
              <h2 className="font-display text-lg font-semibold text-[#0a0e27] mb-2">{status}</h2>
              <p className="text-sm text-slate-500">This may take a few seconds.</p>
            </>
          ) : (
            <>
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: "rgba(244,63,94,0.08)", border: "2px solid #f43f5e" }}
              >
                <span style={{ fontSize: 28, color: "#f43f5e" }}>✕</span>
              </div>
              <h2 className="font-display text-lg font-semibold text-[#0a0e27] mb-2">Connection Failed</h2>
              <p className="text-sm mb-6 text-rose-600">{error}</p>
              <button
                onClick={() => navigate("/connect")}
                className="btn-magnetic btn-primary-glow px-6 py-3 rounded-xl font-semibold text-sm"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

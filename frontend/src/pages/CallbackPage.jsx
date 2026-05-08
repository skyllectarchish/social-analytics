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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "oklch(0.12 0.02 275)" }}>
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="rounded-2xl p-10"
          style={{ background: "oklch(0.18 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)" }}>
          {!error ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: "oklch(0.65 0.25 275 / 0.2)", border: "2px solid oklch(0.65 0.25 275)" }}>
                <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke="oklch(0.65 0.25 275)" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: "oklch(0.95 0.01 275)" }}>
                {status}
              </h2>
              <p className="text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>This may take a few seconds.</p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: "oklch(0.65 0.25 25 / 0.2)", border: "2px solid oklch(0.65 0.25 25)" }}>
                <span style={{ fontSize: 28, color: "oklch(0.65 0.25 25)" }}>✕</span>
              </div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: "oklch(0.95 0.01 275)" }}>Connection Failed</h2>
              <p className="text-sm mb-6" style={{ color: "oklch(0.65 0.25 25)" }}>{error}</p>
              <button onClick={() => navigate("/connect")}
                className="px-6 py-3 rounded-xl font-semibold text-sm"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))", color: "white" }}>
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

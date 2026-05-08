import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "oklch(0.12 0.02 275)" }}>
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))" }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="white">
              <path d="M16 2C8.27 2 2 8.27 2 16s6.27 14 14 14 14-6.27 14-14S23.73 2 16 2zm0 5a4 4 0 110 8 4 4 0 010-8zm0 19.2a10.4 10.4 0 01-8-3.73C8.04 20.27 12.02 19 16 19s7.96 1.27 8 3.47A10.4 10.4 0 0116 26.2z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.95 0.01 275)" }}>Welcome back</h1>
          <p className="mt-1 text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>Sign in to your analytics dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl p-8 space-y-5"
          style={{ background: "oklch(0.18 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)" }}>
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "oklch(0.65 0.25 25 / 0.15)", border: "1px solid oklch(0.65 0.25 25 / 0.3)", color: "oklch(0.80 0.15 25)" }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "oklch(0.80 0.02 275)" }}>Email</label>
            <input
              type="email" required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{ background: "oklch(0.12 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", color: "oklch(0.95 0.01 275)" }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "oklch(0.80 0.02 275)" }}>Password</label>
            <input
              type="password" required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{ background: "oklch(0.12 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", color: "oklch(0.95 0.01 275)" }}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))", color: "white", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>
            No account?{" "}
            <Link to="/register" style={{ color: "oklch(0.75 0.20 275)" }} className="font-medium hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

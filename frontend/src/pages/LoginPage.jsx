import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Validate the `?next=` query param before navigating to it after login.
// Must be a relative path (starts with `/` but not `//`) to prevent
// open-redirect to attacker-controlled origins.
function safeNextOr(next, fallback) {
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return fallback;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(safeNextOr(searchParams.get("next"), "/dashboard"), { replace: true });
    } catch (err) {
      // Distinguish "couldn't reach the server" from "bad credentials" so
      // users on a flaky network don't think they typed the wrong password.
      if (err.code === "ERR_NETWORK" || !err.response) {
        setError("Can't reach the server. Check your connection and try again.");
      } else {
        setError(err.response?.data?.detail || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lumen-landing min-h-screen flex items-center justify-center px-4" style={{ background: "#fafafb" }}>
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="white">
              <path d="M16 2C8.27 2 2 8.27 2 16s6.27 14 14 14 14-6.27 14-14S23.73 2 16 2zm0 5a4 4 0 110 8 4 4 0 010-8zm0 19.2a10.4 10.4 0 01-8-3.73C8.04 20.27 12.02 19 16 19s7.96 1.27 8 3.47A10.4 10.4 0 0116 26.2z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-[#0a0e27]">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your analytics dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-strong rounded-2xl p-8 space-y-5"
          style={{ boxShadow: "var(--shadow-pastel)" }}
        >
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm bg-rose-50 border border-rose-200 text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="block text-sm font-medium mb-2 text-slate-600">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all bg-white border border-slate-200 text-[#0a0e27] placeholder-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium mb-2 text-slate-600">Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-xl px-4 py-3 pr-14 text-sm outline-none transition-all bg-white border border-slate-200 text-[#0a0e27] placeholder-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-violet-600 hover:text-violet-700"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-magnetic btn-primary-glow w-full py-3 rounded-xl font-semibold text-sm"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm text-slate-500">
            No account?{" "}
            <Link to="/register" className="font-medium text-violet-600 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

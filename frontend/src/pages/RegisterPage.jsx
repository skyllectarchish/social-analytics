import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await register(form.email, form.username, form.password);
      navigate("/connect");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
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
              <path d="M16 2C8.27 2 2 8.27 2 16s6.27 14 14 14 14-6.27 14-14S23.73 2 16 2zm7 15h-6v6h-2v-6H9v-2h6V9h2v6h6v2z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.95 0.01 275)" }}>Create account</h1>
          <p className="mt-1 text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>Start analyzing your Instagram</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl p-8 space-y-5"
          style={{ background: "oklch(0.18 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)" }}>
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "oklch(0.65 0.25 25 / 0.15)", border: "1px solid oklch(0.65 0.25 25 / 0.3)", color: "oklch(0.80 0.15 25)" }}>
              {error}
            </div>
          )}

          {[
            { label: "Email", key: "email", type: "email", placeholder: "you@example.com" },
            { label: "Username", key: "username", type: "text", placeholder: "yourname" },
            { label: "Password", key: "password", type: "password", placeholder: "Min 8 characters" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-2" style={{ color: "oklch(0.80 0.02 275)" }}>{label}</label>
              <input
                type={type} required
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: "oklch(0.12 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", color: "oklch(0.95 0.01 275)" }}
                placeholder={placeholder}
              />
            </div>
          ))}

          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))", color: "white", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "oklch(0.75 0.20 275)" }} className="font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

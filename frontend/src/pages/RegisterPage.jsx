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
    <div className="lumen-landing min-h-screen flex items-center justify-center px-4" style={{ background: "#fafafb" }}>
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="white">
              <path d="M16 2C8.27 2 2 8.27 2 16s6.27 14 14 14 14-6.27 14-14S23.73 2 16 2zm7 15h-6v6h-2v-6H9v-2h6V9h2v6h6v2z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-[#0a0e27]">Create account</h1>
          <p className="mt-1 text-sm text-slate-500">Start analyzing your Instagram</p>
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

          {[
            { label: "Email", key: "email", type: "email", placeholder: "you@example.com" },
            { label: "Username", key: "username", type: "text", placeholder: "yourname" },
            { label: "Password", key: "password", type: "password", placeholder: "Min 8 characters" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-2 text-slate-600">{label}</label>
              <input
                type={type}
                required
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none bg-white border border-slate-200 text-[#0a0e27] placeholder-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                placeholder={placeholder}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="btn-magnetic btn-primary-glow w-full py-3 rounded-xl font-semibold text-sm"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-violet-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

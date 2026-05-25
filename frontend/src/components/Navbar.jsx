import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar({ dark = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    dark
      ? `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
          isActive
            ? "bg-white/10 text-white"
            : "text-slate-400 hover:text-white hover:bg-white/8"
        }`
      : `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
          isActive
            ? "bg-violet-100 text-violet-700"
            : "text-slate-600 hover:text-[#0a0e27] hover:bg-slate-100"
        }`;

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
      style={{
        background: dark
          ? "rgba(8,12,26,0.85)"
          : "rgba(255,255,255,0.80)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: dark
          ? "1px solid rgba(255,255,255,0.06)"
          : "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z" />
            </svg>
          </div>
          <span
            className="font-display font-semibold text-sm"
            style={{ color: dark ? "#f0f4ff" : "#0a0e27" }}
          >
            Social Analytics
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/insta-dashboard" className={linkClass}>Instagram</NavLink>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="text-sm hidden sm:block"
          style={{ color: dark ? "#64748b" : "#94a3b8" }}
        >
          @{user?.username}
        </span>
        <button
          onClick={handleLogout}
          className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
          style={{
            background: dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.05)",
            color: dark ? "#94a3b8" : "#64748b",
            border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

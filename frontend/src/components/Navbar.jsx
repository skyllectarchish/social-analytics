import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
      isActive
        ? "bg-violet-100 text-violet-700"
        : "text-slate-600 hover:text-[#0a0e27] hover:bg-slate-100"
    }`;

  return (
    <nav
      className="glass-strong sticky top-0 z-50 flex items-center justify-between px-6 py-3"
      style={{ borderBottom: "1px solid rgba(15,23,42,0.06)" }}
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
          <span className="font-display font-semibold text-sm text-[#0a0e27]">
            Social Analytics
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/insta-dashboard" className={linkClass}>Instagram</NavLink>
          <NavLink to="/stories" className={linkClass}>Stories</NavLink>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500 hidden sm:block">@{user?.username}</span>
        <button
          onClick={handleLogout}
          className="chip-soft text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
      style={{ background: "oklch(0.15 0.02 275 / 0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid oklch(0.30 0.04 275)" }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z"/>
          </svg>
        </div>
        <span className="font-bold text-sm" style={{ color: "oklch(0.95 0.01 275)" }}>Social Analytics</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>@{user?.username}</span>
        <button
          onClick={handleLogout}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
          style={{ background: "oklch(0.25 0.03 275)", color: "oklch(0.70 0.02 275)", border: "1px solid oklch(0.30 0.04 275)" }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

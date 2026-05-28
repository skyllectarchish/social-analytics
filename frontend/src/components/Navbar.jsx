import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const IgIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>
);

const YtIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.2 2.8 12 2.8 12 2.8s-4.2 0-6.8.1c-.6.1-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.1.7 11.3v2c0 2.1.3 4.2.3 4.2s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.2 21.6 12 21.7 12 21.7s4.2 0 6.8-.2c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.1.3-4.2v-2C23.3 9.1 23 7 23 7zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/>
  </svg>
);

const TtIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.2 8.2 0 004.79 1.53V6.78a4.85 4.85 0 01-1.03-.09z"/>
  </svg>
);

const PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    Icon: IgIcon,
    active: true,
    color: "#e1306c",
    bg: "rgba(225,48,108,0.10)",
    border: "rgba(225,48,108,0.25)",
  },
  {
    id: "youtube",
    label: "YouTube",
    Icon: YtIcon,
    active: false,
    color: "#ff0000",
    bg: "rgba(255,0,0,0.07)",
    border: "rgba(255,0,0,0.15)",
  },
  {
    id: "tiktok",
    label: "TikTok",
    Icon: TtIcon,
    active: false,
    color: "#010101",
    bg: "rgba(0,0,0,0.05)",
    border: "rgba(0,0,0,0.10)",
  },
];

export default function Navbar({ dark = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-2.5"
      style={{
        background: dark ? "rgba(8,12,26,0.85)" : "rgba(255,255,255,0.90)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: dark
          ? "1px solid rgba(255,255,255,0.06)"
          : "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <path d="M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z" />
            </svg>
          </div>
          <span
            className="font-display font-semibold text-sm hidden sm:block"
            style={{ color: dark ? "#f0f4ff" : "#0a0e27" }}
          >
            Social Analytics
          </span>
        </div>

        <div
          className="hidden sm:flex items-center gap-1 px-1 py-1 rounded-lg"
          style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.04)" }}
        >
          {PLATFORMS.map(({ id, label, Icon, active, color, bg, border }) => (
            <div
              key={id}
              title={active ? label : `${label} — coming soon`}
              className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
              style={
                active
                  ? { background: bg, color, border: `1px solid ${border}`, cursor: "default" }
                  : {
                      color: dark ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.25)",
                      cursor: "not-allowed",
                      border: "1px solid transparent",
                    }
              }
            >
              <Icon />
              <span className="hidden md:inline">{label}</span>
              {!active && (
                <span
                  className="hidden lg:inline text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded"
                  style={{
                    background: dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)",
                    color: dark ? "rgba(255,255,255,0.3)" : "rgba(15,23,42,0.3)",
                  }}
                >
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span
          className="text-xs hidden sm:block"
          style={{ color: dark ? "#64748b" : "#94a3b8" }}
        >
          @{user?.username}
        </span>
        <button
          onClick={handleLogout}
          className="text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70"
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

import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  ChartNoAxesColumn,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Sparkles,
  Unplug,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import axios from "axios";
import { useAuth } from "../../hooks/useAuth";
import api from "../../api/client";
import type { YoutubeChannel } from "../../api/youtubeTypes";
import { avatar } from "../../data/mock";

const YT_NAV: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "Overview", icon: LayoutDashboard, to: "/youtube" },
  { label: "Retention Studio", icon: ChartNoAxesColumn, to: "/youtube/retention" },
];

function YTIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.8 15.5V8.5l6.3 3.5-6.3 3.5Z" />
    </svg>
  );
}

function SidebarInner({
  username,
  active,
  connected,
  onDisconnect,
  variant = "desktop",
}: {
  username: string;
  active: string;
  connected: boolean | null;
  onDisconnect: () => void;
  variant?: "desktop" | "mobile";
}) {
  return (
    <div className="flex h-full w-64 flex-col gap-1 p-4">
      <div className="flex items-center justify-between px-2 pb-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#dc2626] text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">InfluenceIQ</span>
        </Link>
      </div>

      <div className="glass mb-3 flex items-center gap-3 rounded-2xl p-3">
        <img src={avatar(47)} className="h-9 w-9 rounded-full ring-2 ring-white" alt="" />
        <div className="min-w-0 text-xs">
          <div className="truncate font-semibold">@{username}</div>
          <div className="text-foreground/55">Creator · YouTube</div>
        </div>
      </div>

      {connected && (
        <button
          onClick={onDisconnect}
          className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground/55 transition hover:bg-white/60 hover:text-red-500"
        >
          <Unplug className="h-3.5 w-3.5" /> Disconnect YouTube
        </button>
      )}

      <nav className="space-y-1">
        {YT_NAV.map((item) => {
          const isActive = item.label === active;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive ? "font-semibold text-red-700" : "text-foreground/70 hover:bg-white/60"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={`yt-sidebar-active-${variant}`}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-100 to-red-50 shadow-sm ring-1 ring-red-600/20"
                  transition={{ type: "spring", duration: 0.45, bounce: 0 }}
                />
              )}
              <item.icon className="relative h-4 w-4" />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="card-hairline p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-red-600">
            <YTIcon className="h-3.5 w-3.5" /> YouTube
          </div>
          <p className="mt-2 text-xs text-foreground/55">
            Data pulled from YouTube Analytics API. Sync daily for fresh metrics.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function YoutubeDashboardLayout({
  children,
  active = "Overview",
  onSync,
  syncing,
  fill = false,
}: {
  children: ReactNode;
  active?: string;
  onSync: () => void;
  syncing: boolean;
  fill?: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const username = user?.username ?? "creator";

  async function disconnectYoutube() {
    if (!window.confirm("Disconnect this YouTube channel? You'll need to reconnect to see analytics again.")) return;
    try {
      await api.post("/youtube/disconnect");
    } catch { /* idempotent */ }
    setConnected(false);
    setMobileOpen(false);
    navigate("/youtube/connect");
  }

  useEffect(() => {
    api.get<YoutubeChannel>("/youtube/channel")
      .then(() => setConnected(true))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setConnected(false);
      });
  }, []);

  return (
    <div className="aurora-scene min-h-dvh" style={{ backgroundColor: "#F5F6FA" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #fecaca, transparent 60%)", animation: "drift 22s ease-in-out infinite" }} />
        <div className="absolute top-20 -right-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #fed7aa, transparent 60%)", animation: "drift 28s ease-in-out infinite reverse" }} />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #dbeafe, transparent 60%)", animation: "drift 32s ease-in-out infinite" }} />
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden md:block">
        <SidebarInner username={username} active={active} connected={connected} onDisconnect={disconnectYoutube} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[rgba(10,14,39,0.3)] backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="glass-strong absolute inset-y-0 left-0">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-foreground/60 hover:bg-black/5">
              <X className="h-5 w-5" />
            </button>
            <SidebarInner username={username} active={active} connected={connected} onDisconnect={disconnectYoutube} variant="mobile" />
          </div>
        </div>
      )}

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 border-b border-black/5 bg-white/60 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <button className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onSync} disabled={syncing} className="chip cursor-pointer disabled:opacity-60">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync
              </button>
              <button className="chip !bg-[#dc2626] !text-white">
                <YTIcon className="h-3.5 w-3.5" /> YouTube
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-black/5" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </button>
              <button onClick={logout} title="Sign out" aria-label="Sign out">
                <img src={avatar(47)} className="h-9 w-9 rounded-full ring-2 ring-white" alt="" />
              </button>
            </div>
          </div>
        </header>

        {(() => {
          const banner = connected === false ? (
            <div className="mb-6 flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-red-600/20 bg-red-50/60 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#dc2626] text-white">
                <YTIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Connect your YouTube Channel</div>
                <div className="text-xs text-foreground/60">Link a channel to see retention curves and analytics.</div>
              </div>
              <Link to="/youtube/connect" className="btn-glow !px-4 !py-2 text-sm" style={{ background: "#dc2626", boxShadow: "0 0 16px rgba(220,38,38,0.3)" }}>
                Connect
              </Link>
            </div>
          ) : null;

          return fill ? (
            <main className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden px-4 py-4 md:px-6">
              {banner}
              <div className="min-h-0 flex-1">{children}</div>
            </main>
          ) : (
            <main className="px-4 py-6 md:px-6 md:py-8">
              {banner}
              {children}
            </main>
          );
        })()}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  Calendar,
  Clapperboard,
  GitCompareArrows,
  Dna,
  Film,
  FlaskConical,
  Inbox,
  Instagram,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  Sparkles,
  Swords,
  Unplug,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import axios from "axios";
import { motion } from "framer-motion";
import { useAuth } from "../../hooks/useAuth";
import {
  COMPARE_OPTIONS,
  usePeriodComparator,
  type CompareMode,
} from "../../context/PeriodComparatorContext";
import api, { safeGet } from "../../api/client";
import type { InstagramProfile, QuotaResponse } from "../../api/types";
import { avatar } from "../../data/mock";

type Quota = { used: number; limit: number } | null;

const NAV: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "Overview", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Posts", icon: LayoutGrid, to: "/dashboard/posts" },
  { label: "Stories", icon: Clapperboard, to: "/dashboard/stories" },
  { label: "Inbox", icon: Inbox, to: "/dashboard/inbox" },
  { label: "DM Automation", icon: Workflow, to: "/dashboard/automation" },
  { label: "Content Lab", icon: FlaskConical, to: "/dashboard/content" },
  { label: "Reels Studio", icon: Film, to: "/dashboard/reels" },
  { label: "Audience DNA", icon: Dna, to: "/dashboard/audience" },
  { label: "Competitors", icon: Swords, to: "/dashboard/competitors" },
  { label: "AI Copilot", icon: Bot, to: "/dashboard/copilot" },
];

function SidebarInner({
  username,
  active,
  quota,
  connected,
  onDisconnect,
  variant = "desktop",
}: {
  username: string;
  active: string;
  quota: Quota;
  connected: boolean | null;
  onDisconnect: () => void;
  // Desktop sidebar and mobile drawer are mounted at the same time — the FLIP
  // indicator needs a distinct layoutId per instance or it animates across them.
  variant?: "desktop" | "mobile";
}) {
  const pct = quota && quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  return (
    <div className="flex h-full w-64 flex-col gap-1 p-4">
      <div className="flex items-center justify-between px-2 pb-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="bg-ig grid h-7 w-7 place-items-center rounded-lg text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">InfluenceIQ</span>
        </Link>
      </div>

      <div className="glass mb-3 flex items-center gap-3 rounded-2xl p-3">
        <img src={avatar(47)} className="h-9 w-9 rounded-full ring-2 ring-white" alt="" />
        <div className="min-w-0 text-xs">
          <div className="truncate font-semibold">@{username}</div>
          <div className="text-foreground/55">Creator · Pro</div>
        </div>
      </div>

      {connected && (
        <button
          onClick={onDisconnect}
          className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground/55 transition hover:bg-white/60 hover:text-red-500"
        >
          <Unplug className="h-3.5 w-3.5" /> Disconnect Instagram
        </button>
      )}

      <nav className="space-y-1">
        {NAV.map((item) => {
          const isActive = item.label === active;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive ? "font-semibold text-violet-deep" : "text-foreground/70 hover:bg-white/60"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={`sidebar-active-${variant}`}
                  className="from-lavender to-pink/40 absolute inset-0 rounded-xl bg-gradient-to-r shadow-sm ring-1 ring-violet/20"
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
          <div className="flex items-center gap-2 text-xs font-medium text-violet-deep">
            <Zap className="h-3.5 w-3.5" /> AI quota
          </div>
          <div className="num mt-2 text-lg font-semibold">
            {quota ? `${quota.used} / ${quota.limit}` : "—"}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-lavender">
            <div className="h-full rounded-full bg-gradient-to-r from-violet to-pink-500" style={{ width: `${pct}%` }} />
          </div>
          <button className="mt-3 w-full rounded-full bg-ink py-1.5 text-xs font-medium text-white">
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
  active = "Overview",
  days,
  onDaysChange,
  onSync,
  syncing,
  fill = false,
}: {
  children: ReactNode;
  active?: string;
  days: number;
  onDaysChange: (d: number) => void;
  onSync: () => void;
  syncing: boolean;
  // fill: make <main> a fixed-height flex column (viewport − header) so a child
  // can flex to fill exactly (used by the chat-style Copilot page).
  fill?: boolean;
}) {
  const { user, logout } = useAuth();
  const { compareMode, setCompareMode, customRange, setCustomRange, calendarPreset } = usePeriodComparator();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [quota, setQuota] = useState<Quota>(null);
  // null = unknown/loading, true = connected, false = no IG account linked
  const [connected, setConnected] = useState<boolean | null>(null);
  const username = user?.username ?? "creator";

  async function disconnectInstagram() {
    if (!window.confirm("Disconnect this Instagram account? You'll need to reconnect to see analytics again.")) return;
    try {
      await api.post("/instagram/disconnect");
    } catch {
      /* idempotent — proceed regardless */
    }
    setConnected(false);
    setMobileOpen(false);
    navigate("/connect");
  }

  useEffect(() => {
    if (!profileOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    safeGet<QuotaResponse>("/ai/quota").then((q) => {
      if (q) setQuota({ used: q.used, limit: q.limit });
    });
    // A 404 from /profile means "no Instagram connected" (vs a transient error,
    // which we ignore so the banner doesn't flash on a blip).
    api
      .get<InstagramProfile>("/instagram/profile")
      .then(() => setConnected(true))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setConnected(false);
      });
  }, []);

  return (
    <div className="aurora-scene min-h-dvh" style={{ backgroundColor: "#F5F6FA" }}>
      <div aria-hidden className="no-print pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, #c4b5fd, transparent 60%)", animation: "drift 22s ease-in-out infinite" }} />
        <div className="absolute top-20 -right-32 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, #fbcfe8, transparent 60%)", animation: "drift 28s ease-in-out infinite reverse" }} />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #dbeafe, transparent 60%)", animation: "drift 32s ease-in-out infinite" }} />
      </div>

      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden md:block">
        <SidebarInner username={username} active={active} quota={quota} connected={connected} onDisconnect={disconnectInstagram} />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[rgba(10,14,39,0.3)] backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="glass-strong absolute inset-y-0 left-0">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-foreground/60 hover:bg-black/5">
              <X className="h-5 w-5" />
            </button>
            <SidebarInner username={username} active={active} quota={quota} connected={connected} onDisconnect={disconnectInstagram} variant="mobile" />
          </div>
        </div>
      )}

      <div className="print-flat md:pl-64">
        <header className="no-print sticky top-0 z-20 bg-transparent">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <button className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className={`chip ${calendarPreset ? "opacity-50" : ""}`} title={calendarPreset ? "Window is set by the calendar comparison preset" : undefined}>
                <Calendar className="h-3.5 w-3.5" />
                <select
                  className="bg-transparent text-xs outline-none"
                  value={days}
                  disabled={calendarPreset}
                  onChange={(e) => onDaysChange(Number(e.target.value))}
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
              </div>
              <div className="chip" title="Overlay a prior period for comparison">
                <GitCompareArrows className="h-3.5 w-3.5" />
                <select
                  className="max-w-[110px] bg-transparent text-xs outline-none"
                  value={compareMode}
                  onChange={(e) => setCompareMode(e.target.value as CompareMode)}
                >
                  {COMPARE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {compareMode === "custom" && (
                <div className="chip hidden items-center gap-1 lg:flex">
                  <input
                    type="date"
                    className="bg-transparent text-xs outline-none"
                    value={customRange.from}
                    onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                    aria-label="Compare from"
                  />
                  <span className="text-foreground/40">→</span>
                  <input
                    type="date"
                    className="bg-transparent text-xs outline-none"
                    value={customRange.to}
                    onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                    aria-label="Compare to"
                  />
                </div>
              )}
              <button onClick={onSync} disabled={syncing} className="chip cursor-pointer disabled:opacity-60">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync
              </button>
              <button className="chip !bg-gradient-to-r !from-violet !to-pink-500 !text-white">
                <Zap className="h-3.5 w-3.5" /> {quota ? `${Math.max(0, quota.limit - quota.used)} / ${quota.limit}` : "AI"}
              </button>
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-label="Profile menu"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                >
                  <img src={avatar(47)} className="h-9 w-9 rounded-full ring-2 ring-white" alt="" />
                </button>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    role="menu"
                    className="glass-strong absolute right-0 top-full mt-2 w-56 rounded-2xl p-1.5 shadow-lg ring-1 ring-black/5"
                  >
                    <div className="px-3 py-2 text-xs">
                      <div className="truncate font-semibold">@{username}</div>
                      {user?.email && <div className="truncate text-foreground/55">{user.email}</div>}
                    </div>
                    <div className="my-1 h-px bg-black/5" />
                    {connected && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setProfileOpen(false);
                          disconnectInstagram();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground/70 transition hover:bg-white/60 hover:text-red-500"
                      >
                        <Unplug className="h-3.5 w-3.5" /> Disconnect Instagram
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground/70 transition hover:bg-white/60"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </header>

        {(() => {
          const banner =
            connected === false ? (
              <div className="no-print mb-6 flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-violet/20 bg-lavender/60 px-4 py-3">
                <span className="bg-ig grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white">
                  <Instagram className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Connect your Instagram</div>
                  <div className="text-xs text-foreground/60">
                    Link a Business or Creator account to see your real analytics here.
                  </div>
                </div>
                <Link to="/connect" className="btn-glow !px-4 !py-2 text-sm">
                  Connect <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null;

          return fill ? (
            <main className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden px-4 py-4 md:px-6">
              {banner}
              <div className="min-h-0 flex-1">{children}</div>
            </main>
          ) : (
            <main className="print-flat px-4 py-6 md:px-6 md:py-8">
              {banner}
              {children}
            </main>
          );
        })()}
      </div>
    </div>
  );
}

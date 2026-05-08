import {
  Bell,
  BookOpen,
  Bookmark,
  ChevronDown,
  Compass,
  Heart,
  Home,
  LayoutGrid,
  MessageCircle,
  Music2,
  Search,
  Settings,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";

/* --------------------------------------------------------------------- */
/*  DashboardMockup                                                       */
/*                                                                        */
/*  A realistic in-product view used as the hero centerpiece.             */
/*  ┌─ chrome (traffic + url + tabs) ─────────────────────────────────┐   */
/*  │ ┌─ sidebar (workspace + nav + Pro card) ─┐ ┌─ main canvas ────┐ │   */
/*  │ │                                        │ │ header bar       │ │   */
/*  │ │                                        │ │ chart + insights │ │   */
/*  │ │                                        │ │ KPI strip        │ │   */
/*  │ │                                        │ │ top reels list   │ │   */
/*  │ └────────────────────────────────────────┘ └──────────────────┘ │   */
/*  └────────────────────────────────────────────────────────────────────┘ */
/* --------------------------------------------------------------------- */

const NAV = [
  { icon: Home, label: "Dashboard", active: true, badge: null },
  { icon: LayoutGrid, label: "Reels", active: false, badge: "12" },
  { icon: Users, label: "Audience", active: false, badge: null },
  { icon: Wand2, label: "AI Insights", active: false, badge: "new" },
  { icon: Compass, label: "Brand Hub", active: false, badge: "3" },
  { icon: Music2, label: "Trending Audio", active: false, badge: null },
  { icon: BookOpen, label: "Tips", active: false, badge: null },
];

const KPIS = [
  { label: "Likes", value: "248K", growth: "+12.4%", color: "text-pink-500" },
  { label: "Comments", value: "38K", growth: "+8.1%", color: "text-cyan-500" },
  { label: "Shares", value: "14.2K", growth: "+22.0%", color: "text-violet-500" },
  { label: "Saves", value: "48.2K", growth: "+18.4%", color: "text-emerald-600" },
];

const REELS = [
  { name: "Sunset Fade — Reel 048", views: "2.1M", growth: "+312%", color: "from-fuchsia-500 to-pink-500" },
  { name: "Studio Session — Reel 052", views: "1.4M", growth: "+184%", color: "from-cyan-500 to-indigo-500" },
  { name: "Behind the Lens", views: "920K", growth: "+96%", color: "from-violet-500 to-fuchsia-500" },
];

export default function DashboardMockup() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.35),0_8px_32px_-12px_rgba(99,102,241,0.18)] backdrop-blur-xl">
      {/* Inset highlight for premium feel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)",
        }}
      />

      {/* Chrome bar */}
      <div className="flex items-center gap-3 border-b border-slate-200/70 bg-white/70 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-400/85" />
          <span className="h-3 w-3 rounded-full bg-amber-400/85" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/85" />
        </div>
        <div className="ml-2 flex flex-1 items-center gap-2 rounded-md bg-slate-100/80 px-2.5 py-1 text-[11px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono tracking-tight">app.lumen.io / dashboard</span>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="rounded-md bg-slate-100/80 px-2 py-1 text-[10px] font-medium text-slate-600">
            ⌘ K
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-[180px,1fr] sm:grid-cols-[220px,1fr]">
        {/* ----- Sidebar ----- */}
        <aside className="hidden border-r border-slate-200/70 bg-gradient-to-b from-white/60 to-slate-50/60 px-3 py-4 sm:block">
          {/* Workspace switcher */}
          <button className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_-4px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-[10px] font-bold text-white shadow-[0_4px_10px_-2px_rgba(139,92,246,0.55)]">
                MO
              </span>
              <div>
                <div className="font-body text-[11px] font-semibold leading-none text-[#0a0e27]">
                  Mira's studio
                </div>
                <div className="font-body mt-1 text-[9.5px] leading-none text-slate-500">
                  Creator · 1.2M
                </div>
              </div>
            </div>
            <ChevronDown size={12} className="text-slate-400" />
          </button>

          {/* Nav */}
          <nav className="mt-5 space-y-0.5">
            <div className="font-body mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Workspace
            </div>
            {NAV.map(({ icon: Icon, label, active, badge }) => (
              <div
                key={label}
                className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] font-medium ${
                  active
                    ? "bg-[#0a0e27] text-white shadow-[0_6px_14px_-6px_rgba(10,14,39,0.4)]"
                    : "text-slate-600"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={13} className={active ? "" : "text-slate-400"} />
                  {label}
                </span>
                {badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-bold ${
                      badge === "new"
                        ? "bg-fuchsia-100 text-fuchsia-700"
                        : active
                        ? "bg-white/15 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </div>
            ))}
          </nav>

          {/* Pro upgrade card */}
          <div className="mt-5 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-3 text-white shadow-[0_10px_24px_-10px_rgba(139,92,246,0.55)]">
            <div className="flex items-center gap-1.5">
              <Sparkles size={11} />
              <div className="font-body text-[9.5px] font-bold uppercase tracking-[0.14em]">
                Creator Pro
              </div>
            </div>
            <div className="font-display mt-1.5 text-[12.5px] leading-tight">
              Unlock AI insights & priority brand match
            </div>
            <button className="mt-2.5 w-full rounded-md bg-white px-2 py-1.5 text-[10.5px] font-semibold text-[#0a0e27]">
              Upgrade
            </button>
          </div>
        </aside>

        {/* ----- Main ----- */}
        <main className="relative overflow-hidden bg-gradient-to-br from-white to-slate-50/40 p-4 sm:p-5">
          {/* Top header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
                <span className="font-medium">Workspace</span>
                <ChevronDown size={10} />
                <span>Dashboard</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="font-display text-[20px] font-semibold tracking-[-0.025em] text-[#0a0e27]">
                  Hi Mira, here's your week
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 ring-1 ring-slate-200/70 hover:text-[#0a0e27]">
                <Search size={12} />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 ring-1 ring-slate-200/70">
                <Bell size={12} />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 ring-1 ring-slate-200/70">
                <Settings size={12} />
              </button>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-pink-500 text-[9.5px] font-bold text-white">
                MO
              </span>
            </div>
          </div>

          {/* Chart + insights row */}
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.55fr,1fr]">
            {/* Engagement chart */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-body text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Engagement
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className="font-display text-[26px] font-semibold leading-none text-[#0a0e27]">
                      1,284,750
                    </div>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                      +18.4%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[9.5px] text-slate-500">
                  {["7d", "30d", "90d"].map((p, i) => (
                    <span
                      key={p}
                      className={`rounded-md px-1.5 py-0.5 font-medium ${
                        i === 1 ? "bg-slate-900 text-white" : "ring-1 ring-slate-200/70"
                      }`}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3 h-[120px]">
                <svg viewBox="0 0 400 120" className="h-full w-full overflow-visible">
                  <defs>
                    <linearGradient id="dm-line" x1="0" x2="1">
                      <stop offset="0" stopColor="#22d3ee" />
                      <stop offset="0.5" stopColor="#a78bfa" />
                      <stop offset="1" stopColor="#ec4899" />
                    </linearGradient>
                    <linearGradient id="dm-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="rgba(167,139,250,0.32)" />
                      <stop offset="1" stopColor="rgba(167,139,250,0)" />
                    </linearGradient>
                  </defs>
                  {[28, 56, 84].map((y) => (
                    <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="rgba(15,23,42,0.05)" strokeDasharray="3 6" />
                  ))}
                  <path
                    d="M0 96 L40 82 L80 88 L120 64 L160 74 L200 50 L240 60 L280 32 L320 42 L360 18 L400 12 L400 120 L0 120 Z"
                    fill="url(#dm-area)"
                  />
                  <path
                    d="M0 96 L40 82 L80 88 L120 64 L160 74 L200 50 L240 60 L280 32 L320 42 L360 18 L400 12"
                    stroke="url(#dm-line)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="1200"
                    strokeDashoffset="1200"
                    style={{ animation: "drawLine 2.6s ease-out 0.4s forwards" }}
                  />
                  <circle cx="360" cy="18" r="4" fill="#ec4899">
                    <animate attributeName="r" values="4;7;4" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>

              <div className="mt-1 flex items-center justify-between text-[9.5px] text-slate-500">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            </div>

            {/* Insights stack */}
            <div className="space-y-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-3.5 text-white shadow-[0_10px_28px_-12px_rgba(139,92,246,0.55)]">
                <div className="flex items-center gap-1.5">
                  <Wand2 size={11} />
                  <div className="font-body text-[9.5px] font-bold uppercase tracking-[0.14em]">
                    AI insights · today
                  </div>
                </div>
                <div className="font-display mt-2 text-[15px] leading-tight">
                  Post Reels at <strong className="text-white">7:42 PM</strong> — predicted reach{" "}
                  <strong>+38%</strong>.
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[9.5px] text-white/85">
                  <span>Confidence · 0.92</span>
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 font-bold">Apply</span>
                </div>
              </div>

              <div className="rounded-xl bg-white p-3.5 ring-1 ring-slate-200/70">
                <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <TrendingUp size={11} className="text-emerald-600" /> Trending hook
                </div>
                <p className="font-body mt-1.5 text-[11.5px] leading-snug text-slate-700">
                  "Try this in seconds 1–3" raises retention{" "}
                  <strong className="text-[#0a0e27]">+24%</strong> on your niche.
                </p>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {KPIS.map((k) => {
              const Icon = { Likes: Heart, Comments: MessageCircle, Shares: Share2, Saves: Bookmark }[k.label];
              return (
                <div
                  key={k.label}
                  className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200/70"
                >
                  <div className="flex items-center justify-between">
                    <Icon size={11} className={k.color} />
                    <span className="rounded-full bg-emerald-100 px-1 py-0.5 text-[8.5px] font-bold text-emerald-700">
                      {k.growth}
                    </span>
                  </div>
                  <div className="font-display mt-1.5 text-[16px] font-semibold leading-none text-[#0a0e27]">
                    {k.value}
                  </div>
                  <div className="font-body mt-1 text-[9.5px] font-medium text-slate-500">
                    {k.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top reels strip */}
          <div className="mt-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between">
              <div className="font-body text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Top reels · this week
              </div>
              <span className="font-body text-[10px] font-semibold text-[#0a0e27]">
                View all →
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {REELS.map((r) => (
                <div key={r.name} className="flex items-center gap-2.5">
                  <div className={`relative h-7 w-5 shrink-0 overflow-hidden rounded-md bg-gradient-to-br ${r.color} shadow-[0_4px_10px_-3px_rgba(167,139,250,0.4)]`}>
                    <Star size={6} className="absolute right-0.5 top-0.5 text-white/85" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-body truncate text-[11px] font-semibold text-[#0a0e27]">
                      {r.name}
                    </div>
                    <div className="font-body text-[9.5px] text-slate-500">{r.views} views</div>
                  </div>
                  <div className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                    {r.growth}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

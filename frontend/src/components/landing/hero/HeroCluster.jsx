import { motion } from "framer-motion";
import {
  Bell,
  Bookmark,
  ChevronDown,
  Heart,
  MessageCircle,
  Music2,
  Play,
  Search,
  Sparkles,
  TrendingUp,
  Wand2,
} from "lucide-react";

/* ----------------------------------------------------------------------- */
/*  HeroCluster — overlapping composition cluster for the right-side hero.  */
/*                                                                          */
/*  Composition flow (depth ascending):                                     */
/*    1. Underglow (z-0)                                                    */
/*    2. Main panel — compact dashboard (z-10)                              */
/*    3. AI Insight card — top-left overlap, slight CCW rotation (z-20)     */
/*    4. Trending reel card — vertical, right edge, slight CW rotation      */
/*    5. Brand match card — bottom, hangs off, no rotation (z-30)           */
/*    6. Live notification toast — mid-right, hangs off (z-30)              */
/*                                                                          */
/*  Cards overlap intentionally; their offsets are chosen so each one       */
/*  reveals a corner of the layer beneath, guiding the eye in a Z-pattern.  */
/* ----------------------------------------------------------------------- */

const cardEnter = (delay = 0) => ({
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.85, delay, ease: [0.2, 0.8, 0.2, 1] },
});

export default function HeroCluster() {
  return (
    <div className="relative h-[580px] sm:h-[620px] lg:h-[640px]">
      {/* ── Underglow ─────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 50% at 60% 40%, rgba(167,139,250,0.32), transparent 70%), radial-gradient(35% 35% at 30% 80%, rgba(34,211,238,0.22), transparent 70%), radial-gradient(35% 35% at 85% 80%, rgba(244,114,182,0.22), transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      {/* ── 1. MAIN PANEL — compact dashboard (anchor) ────────────── */}
      <motion.div
        {...cardEnter(0.15)}
        className="absolute right-0 top-6 z-10 w-[88%] max-w-[460px]"
        style={{ animation: "orbFloatSm 12s ease-in-out infinite" }}
      >
        <MainPanel />
      </motion.div>

      {/* ── 2. AI INSIGHT — top-left overlap ──────────────────────── */}
      <motion.div
        {...cardEnter(0.45)}
        className="absolute left-0 top-0 z-20 w-[230px] sm:w-[250px]"
        style={{
          transform: "rotate(-2.5deg)",
          animation: "orbFloatSm 9s ease-in-out infinite 0.3s",
        }}
      >
        <AICard />
      </motion.div>

      {/* ── 3. TRENDING REEL — top-right edge, vertical ───────────── */}
      <motion.div
        {...cardEnter(0.55)}
        className="absolute right-[-18px] top-[58px] z-20 w-[150px] sm:w-[160px]"
        style={{
          transform: "rotate(3deg)",
          animation: "orbFloat 11s ease-in-out infinite 0.6s",
        }}
      >
        <ReelCard />
      </motion.div>

      {/* ── 4. BRAND MATCH — bottom, hangs off bottom-left ────────── */}
      <motion.div
        {...cardEnter(0.7)}
        className="absolute left-[-12px] bottom-0 z-30 w-[280px] sm:w-[300px]"
        style={{ animation: "orbFloat 10s ease-in-out infinite 1s" }}
      >
        <BrandMatchCard />
      </motion.div>

      {/* ── 5. LIVE NOTIFICATION — mid-right, hangs off ───────────── */}
      <motion.div
        {...cardEnter(0.85)}
        className="absolute right-[-14px] bottom-[180px] z-30 w-[210px]"
        style={{
          transform: "rotate(2deg)",
          animation: "orbFloatSm 13s ease-in-out infinite 0.4s",
        }}
      >
        <LiveToast />
      </motion.div>

      {/* ── Subtle decorative ring (purely visual) ────────────────── */}
    </div>
  );
}

/* ─────────────── Main panel (compact dashboard) ─────────────────── */

function MainPanel() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/92 shadow-[0_40px_100px_-30px_rgba(15,23,42,0.45),0_8px_24px_-12px_rgba(99,102,241,0.22)] backdrop-blur-2xl">
      {/* Inset highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95)" }}
      />

      {/* Chrome */}
      <div className="flex items-center gap-2 border-b border-slate-200/70 bg-white/65 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-rose-400/85" />
        <span className="h-2 w-2 rounded-full bg-amber-400/85" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/85" />
        <div className="ml-1.5 flex flex-1 items-center gap-1.5 rounded-md bg-slate-100/80 px-2 py-0.5 text-[10px] text-slate-500">
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          <span className="font-mono">app.lumen.io / dashboard</span>
        </div>
        <Search size={11} className="text-slate-400" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="flex items-center gap-1 text-[9.5px] text-slate-500">
            <span className="font-medium">Workspace</span>
            <ChevronDown size={9} />
            <span>Dashboard</span>
          </div>
          <div className="font-display mt-1 flex items-center gap-1.5 text-[15px] font-semibold leading-none tracking-[-0.02em] text-[#0a0e27]">
            Mira's studio
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8.5px] font-bold text-emerald-700">
              <span className="h-1 w-1 rounded-full bg-emerald-500" /> Live
            </span>
          </div>
        </div>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-pink-500 text-[9px] font-bold text-white">
          MO
        </span>
      </div>

      {/* Engagement chart */}
      <div className="mx-4 rounded-xl bg-gradient-to-br from-slate-50 to-white p-3 ring-1 ring-slate-200/70">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Engagement · 30d
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <div className="font-display text-[22px] font-semibold leading-none text-[#0a0e27]">
                1.28M
              </div>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                +18.4%
              </span>
            </div>
          </div>
        </div>
        <div className="mt-2 h-[68px]">
          <svg viewBox="0 0 360 68" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="hc-line" x1="0" x2="1">
                <stop offset="0" stopColor="#22d3ee" />
                <stop offset="0.5" stopColor="#a78bfa" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
              <linearGradient id="hc-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="rgba(167,139,250,0.32)" />
                <stop offset="1" stopColor="rgba(167,139,250,0)" />
              </linearGradient>
            </defs>
            {[20, 42].map((y) => (
              <line
                key={y}
                x1="0"
                x2="360"
                y1={y}
                y2={y}
                stroke="rgba(15,23,42,0.05)"
                strokeDasharray="3 6"
              />
            ))}
            <path
              d="M0 56 L36 48 L72 52 L108 36 L144 42 L180 28 L216 34 L252 18 L288 24 L324 10 L360 6 L360 68 L0 68 Z"
              fill="url(#hc-area)"
            />
            <path
              d="M0 56 L36 48 L72 52 L108 36 L144 42 L180 28 L216 34 L252 18 L288 24 L324 10 L360 6"
              stroke="url(#hc-line)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="800"
              strokeDashoffset="800"
              style={{ animation: "drawLine 2.4s ease-out 0.6s forwards" }}
            />
            <circle cx="324" cy="10" r="3.5" fill="#ec4899">
              <animate
                attributeName="r"
                values="3.5;6;3.5"
                dur="2.4s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mx-4 mt-3 grid grid-cols-4 gap-1.5">
        {[
          { Icon: Heart, label: "Likes", value: "248K", color: "text-pink-500" },
          { Icon: MessageCircle, label: "Comments", value: "38K", color: "text-cyan-500" },
          { Icon: Bookmark, label: "Saves", value: "48K", color: "text-emerald-600" },
          { Icon: TrendingUp, label: "Reach", value: "2.4M", color: "text-violet-500" },
        ].map(({ Icon, label, value, color }) => (
          <div
            key={label}
            className="rounded-md bg-white p-1.5 ring-1 ring-slate-200/70"
          >
            <Icon size={10} className={color} />
            <div className="font-display mt-1 text-[12px] font-semibold leading-none text-[#0a0e27]">
              {value}
            </div>
            <div className="font-body mt-0.5 text-[8.5px] font-medium text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Top reels list */}
      <div className="m-4 mt-3 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/60">
        <div className="flex items-center justify-between">
          <div className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Top reels
          </div>
          <span className="font-body text-[9.5px] font-semibold text-[#0a0e27]">
            View →
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          {[
            { name: "Sunset Fade · 048", v: "2.1M", g: "+312%", c: "from-fuchsia-500 to-pink-500" },
            { name: "Studio Session · 052", v: "1.4M", g: "+184%", c: "from-cyan-500 to-indigo-500" },
            { name: "Behind the Lens", v: "920K", g: "+96%", c: "from-violet-500 to-fuchsia-500" },
          ].map((r) => (
            <div key={r.name} className="flex items-center gap-2">
              <div
                className={`h-5 w-3.5 shrink-0 rounded-sm bg-gradient-to-br ${r.c} shadow-[0_3px_8px_-2px_rgba(167,139,250,0.4)]`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-body truncate text-[10px] font-semibold leading-tight text-[#0a0e27]">
                  {r.name}
                </div>
                <div className="font-body text-[8.5px] text-slate-500">
                  {r.v} views
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-1 py-0.5 text-[8.5px] font-bold text-emerald-700">
                {r.g}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── AI Insight card ─────────────────── */

function AICard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-[0_24px_60px_-18px_rgba(15,23,42,0.32),0_4px_12px_-4px_rgba(99,102,241,0.18)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_18px_-6px_rgba(139,92,246,0.55)]">
          <Wand2 size={12} className="text-white" />
        </span>
        <div className="min-w-0">
          <div className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            AI Insight
          </div>
          <div className="font-body text-[11px] font-semibold leading-none text-[#0a0e27]">
            3 sec ago
          </div>
        </div>
      </div>
      <p className="font-body mt-2 text-[11.5px] leading-snug text-slate-700">
        Post Reels at <strong className="text-[#0a0e27]">7:42 PM</strong> —
        predicted reach <strong className="text-emerald-600">+38%</strong>.
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button className="rounded-full bg-[#0a0e27] px-2.5 py-1 text-[9.5px] font-semibold text-white">
          Schedule
        </button>
        <button className="text-[9.5px] font-semibold text-slate-500">
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Trending reel card (vertical) ─────────────────── */

function ReelCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-18px_rgba(15,23,42,0.32)] backdrop-blur-xl">
      <div className="relative h-[200px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, rgba(217,70,239,1), rgba(99,102,241,1) 55%, rgba(34,211,238,1))",
          }}
        />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-white backdrop-blur">
          <Play size={8} fill="white" /> Reel
        </div>
        <div className="absolute right-2 top-2 rounded-full bg-emerald-400/95 px-1.5 py-0.5 text-[8.5px] font-bold text-white">
          +312%
        </div>
        {/* Waveform */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-0.5 px-2 pb-1.5">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="audio-bar w-0.5 rounded-full bg-white/95"
              style={{
                height: `${8 + ((i * 9) % 24)}px`,
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
        {/* Center play */}
        <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]">
          <Play size={14} className="ml-0.5 text-[#0a0e27]" fill="currentColor" />
        </div>
      </div>
      <div className="p-2.5">
        <div className="font-body truncate text-[10.5px] font-semibold text-[#0a0e27]">
          Sunset Fade
        </div>
        <div className="font-body mt-0.5 flex items-center gap-1 text-[9px] text-slate-500">
          <Music2 size={8} className="text-violet-500" /> 2.1M plays
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Brand match card ─────────────────── */

function BrandMatchCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-[0_28px_70px_-20px_rgba(15,23,42,0.4),0_4px_12px_-4px_rgba(99,102,241,0.2)] backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 text-[10px] font-black text-white shadow-[0_8px_20px_-6px_rgba(34,211,238,0.55)]">
          AU
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-body text-[11.5px] font-semibold leading-tight text-[#0a0e27]">
            Aurora Beauty · Spring drop
          </div>
          <div className="font-body mt-0.5 text-[9.5px] text-slate-500">
            UGC campaign · 3 deliverables
          </div>
        </div>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-fuchsia-700">
          New
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="font-body flex flex-1 items-center gap-2">
          <span className="font-display text-[18px] font-semibold leading-none text-[#0a0e27]">
            96%
          </span>
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 shimmer-line"
              style={{ width: "96%" }}
            />
          </div>
        </div>
        <span className="font-body text-[9.5px] font-medium text-slate-500">
          match
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-body text-[10px] font-medium text-slate-600">
          Budget · <strong className="text-[#0a0e27]">$4,500</strong>
        </span>
        <button className="inline-flex items-center gap-1 rounded-full bg-[#0a0e27] px-2.5 py-1 text-[9.5px] font-semibold text-white">
          Accept brief
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Live notification toast ─────────────────── */

function LiveToast() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 p-2.5 shadow-[0_18px_44px_-14px_rgba(15,23,42,0.32)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-[0_6px_14px_-4px_rgba(34,211,238,0.5)]">
          <Sparkles size={11} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-body text-[10px] font-semibold leading-tight text-[#0a0e27]">
            +1,284 new followers
          </div>
          <div className="font-body text-[8.5px] text-slate-500">
            Past 24h · trending
          </div>
        </div>
        <Bell size={10} className="text-slate-400" />
      </div>
    </div>
  );
}

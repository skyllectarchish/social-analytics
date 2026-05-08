import { motion } from "framer-motion";
import {
  Bookmark,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";
import AnimatedCounter from "../ui/AnimatedCounter";

const DEMOGRAPHIC_BARS = [
  { label: "18–24", value: 38, color: "from-fuchsia-500 to-pink-500" },
  { label: "25–34", value: 46, color: "from-indigo-500 to-violet-500" },
  { label: "35–44", value: 12, color: "from-cyan-500 to-blue-500" },
  { label: "45+", value: 4, color: "from-emerald-500 to-teal-500" },
];

const TOP_REELS = [
  { name: "Sunset fade · Reel 048", views: "2.1M", growth: "+312%", color: "from-fuchsia-500 to-pink-500" },
  { name: "Studio session · Reel 052", views: "1.4M", growth: "+184%", color: "from-cyan-500 to-indigo-500" },
  { name: "Behind the lens", views: "920K", growth: "+96%", color: "from-violet-500 to-fuchsia-500" },
];

export default function AnalyticsPreview() {
  return (
    <section id="analytics" className="relative scroll-mt-24 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Analytics preview"
          title={
            <>
              A dashboard that thinks{" "}
              <span className="text-gradient">like a strategist</span>
            </>
          }
          description="Audience demographics, growth charts, reels performance, and AI-flagged opportunities — all in one luxurious cockpit."
        />

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.7 }}
          className="relative mt-12"
        >
          {/* Floating widgets */}
          <motion.div
            className="absolute -left-3 top-10 z-10 hidden lg:block"
            style={{ animation: "orbFloat 8s ease-in-out infinite" }}
          >
            <GlassCard className="w-44 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Saves
              </div>
              <div className="font-display mt-1 text-2xl font-semibold text-[#0a0e27]">
                <AnimatedCounter value={48230} />
              </div>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                <TrendingUp size={10} /> +24%
              </div>
            </GlassCard>
          </motion.div>
          <motion.div
            className="absolute -right-3 top-32 z-10 hidden lg:block"
            style={{ animation: "orbFloat 10s ease-in-out infinite 0.6s" }}
          >
            <GlassCard className="w-48 p-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <Sparkles size={11} className="text-amber-500" /> AI tip
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                Post Reels at 7:42 PM today — predicted reach <strong className="text-[#0a0e27]">+38%</strong>.
              </p>
            </GlassCard>
          </motion.div>

          <GlassCard className="overflow-hidden p-0" tilt={false} hoverLift={false}>
            {/* Mock app chrome */}
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/60 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Lumen · Insights
                </span>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                  Last 30 days
                </span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  Live
                </span>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.4fr,1fr]">
              {/* Engagement chart */}
              <div className="rounded-2xl glass-subtle p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Engagement
                    </div>
                    <div className="font-display mt-1 text-3xl font-semibold text-[#0a0e27] sm:text-4xl">
                      <AnimatedCounter value={1284750} />
                    </div>
                  </div>
                  <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    +18.4%
                  </div>
                </div>

                <div className="mt-6 h-44 w-full">
                  <svg viewBox="0 0 400 160" className="h-full w-full overflow-visible">
                    <defs>
                      <linearGradient id="line-grad" x1="0" x2="1">
                        <stop offset="0" stopColor="#22d3ee" />
                        <stop offset="0.5" stopColor="#a78bfa" />
                        <stop offset="1" stopColor="#ec4899" />
                      </linearGradient>
                      <linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="rgba(167,139,250,0.35)" />
                        <stop offset="1" stopColor="rgba(167,139,250,0)" />
                      </linearGradient>
                    </defs>
                    {[40, 80, 120].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        x2="400"
                        y1={y}
                        y2={y}
                        stroke="rgba(15,23,42,0.06)"
                        strokeDasharray="3 6"
                      />
                    ))}
                    <path
                      d="M0 130 L40 110 L80 118 L120 88 L160 100 L200 70 L240 80 L280 50 L320 60 L360 32 L400 24 L400 160 L0 160 Z"
                      fill="url(#area-grad)"
                    />
                    <path
                      d="M0 130 L40 110 L80 118 L120 88 L160 100 L200 70 L240 80 L280 50 L320 60 L360 32 L400 24"
                      stroke="url(#line-grad)"
                      strokeWidth="2.75"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray="1200"
                      strokeDashoffset="1200"
                      style={{ animation: "drawLine 2.6s ease-out 0.4s forwards" }}
                    />
                    <circle cx="360" cy="32" r="5" fill="#ec4899">
                      <animate
                        attributeName="r"
                        values="5;9;5"
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </svg>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                  {[
                    { icon: Heart, label: "Likes", value: 248120, color: "text-pink-500" },
                    { icon: MessageCircle, label: "Comments", value: 38420, color: "text-cyan-500" },
                    { icon: Share2, label: "Shares", value: 14200, color: "text-violet-500" },
                    { icon: Bookmark, label: "Saves", value: 48230, color: "text-emerald-700" },
                  ].map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className="rounded-xl glass p-3 transition hover:translate-y-[-2px]"
                      >
                        <Icon size={13} className={stat.color} />
                        <div className="font-display mt-1.5 text-base font-semibold text-[#0a0e27]">
                          <AnimatedCounter value={stat.value} />
                        </div>
                        <div className="text-[10px] font-medium text-slate-500">{stat.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-5">
                {/* Demographics */}
                <div className="rounded-2xl glass-subtle p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Audience demographics
                    </div>
                    <Eye size={14} className="text-slate-400" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {DEMOGRAPHIC_BARS.map((bar, i) => (
                      <div key={bar.label}>
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                          <span>{bar.label}</span>
                          <span className="text-slate-500">{bar.value}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${bar.value}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.2, delay: 0.2 + i * 0.1, ease: [0.2, 0.8, 0.2, 1] }}
                            className={`h-full rounded-full bg-gradient-to-r ${bar.color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top reels */}
                <div className="rounded-2xl glass-subtle p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Top reels
                    </div>
                    <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                      This week
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {TOP_REELS.map((r, i) => (
                      <motion.div
                        key={r.name}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                        className="flex items-center gap-3"
                      >
                        <div
                          className={`relative h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${r.color} shadow-[0_8px_18px_-8px_rgba(167,139,250,0.45)]`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[#0a0e27]">{r.name}</div>
                          <div className="text-[11px] text-slate-500">{r.views} views</div>
                        </div>
                        <div className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {r.growth}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}

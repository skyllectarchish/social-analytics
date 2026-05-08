import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Brain,
  Handshake,
  Lightbulb,
  Music2,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";

export default function FeaturesSection() {
  return (
    <section id="features" className="relative scroll-mt-24 py-20 sm:py-26">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Core capabilities"
          title={
            <>
              Everything you need to{" "}
              <span className="text-gradient-aurora">scale creatively</span>
            </>
          }
          description="A unified workspace for analytics, AI insights, brand collaborations, and creator community — engineered to feel effortless."
        />

        {/* Bento grid */}
        <div className="mt-12 grid auto-rows-[minmax(220px,auto)] grid-cols-1 gap-5 md:grid-cols-6">
          {/* HERO BENTO — AI insights (spans 4 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6 }}
            className="md:col-span-4 md:row-span-2"
          >
            <GlassCard className="group relative h-full overflow-hidden p-7 sm:p-9" tilt={false}>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(99,102,241,0.40), transparent 65%)",
                  filter: "blur(40px)",
                  animation: "pulseGlow 9s ease-in-out infinite",
                }}
              />
              <div className="relative grid h-full gap-6 lg:grid-cols-[1.1fr,1fr] lg:items-center">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_12px_28px_-10px_rgba(139,92,246,0.55)]">
                    <Brain size={20} className="text-[#0a0e27]" />
                  </div>
                  <h3 className="font-display mt-5 text-3xl font-semibold leading-tight tracking-[-0.03em] text-[#0a0e27] sm:text-4xl">
                    AI Growth Insights
                  </h3>
                  <p className="font-body mt-3 max-w-md text-[15px] leading-relaxed text-slate-600">
                    Our recommendation engine watches your audience around the
                    clock — surfacing post timing, hook angles, and content gaps
                    tuned to <span className="font-semibold text-[#0a0e27]">your</span> niche.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0a0e27]">
                    Learn more
                    <ArrowUpRight size={14} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </div>

                {/* Mini visual: stacked AI tip cards */}
                <div className="relative h-[210px]">
                  <div
                    className="absolute right-0 top-0 w-[230px] rounded-2xl glass p-3.5 shadow-[var(--shadow-premium)]"
                    style={{ animation: "orbFloatSm 8s ease-in-out infinite" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-amber-400 to-orange-500">
                        <Sparkles size={11} className="text-[#0a0e27]" />
                      </span>
                      <div className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Best time today
                      </div>
                    </div>
                    <div className="font-display mt-2 text-2xl font-semibold leading-none text-[#0a0e27]">
                      7:42 PM
                    </div>
                    <div className="font-body mt-1 text-[11px] text-emerald-700">
                      Predicted reach +38%
                    </div>
                  </div>
                  <div
                    className="absolute right-12 top-[120px] w-[210px] rounded-2xl glass p-3.5 shadow-[var(--shadow-premium)]"
                    style={{ animation: "orbFloatSm 9s ease-in-out infinite 0.5s" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-fuchsia-500 to-pink-500">
                        <Zap size={11} className="text-[#0a0e27]" />
                      </span>
                      <div className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Hook detected
                      </div>
                    </div>
                    <p className="font-body mt-2 text-[12px] leading-snug text-slate-700">
                      "Try this in seconds 1–3" raises retention <strong className="text-[#0a0e27]">+24%</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Engagement analytics (2 cols) */}
          <BentoCard
            delay={0.08}
            className="md:col-span-2"
            icon={BarChart3}
            iconAccent="from-cyan-400 to-blue-600"
            glow="rgba(34,211,238,0.35)"
            title="Engagement Analytics"
            description="Likes, comments, saves, reach — synced in real time."
          >
            <div className="mt-5 flex items-end gap-1.5 h-12">
              {[36, 48, 30, 64, 52, 72, 58, 80].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-md bg-gradient-to-t from-cyan-500 to-violet-500 bar-rise"
                  style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          </BentoCard>

          {/* Brand collab (2 cols) */}
          <BentoCard
            delay={0.14}
            className="md:col-span-2"
            icon={Handshake}
            iconAccent="from-fuchsia-500 to-pink-500"
            glow="rgba(217,70,239,0.35)"
            title="Brand Collaboration Hub"
            description="AI-matched briefs and unified campaign management."
          >
            <div className="mt-4 space-y-2">
              {[
                { brand: "Aurora Beauty", match: 96, color: "from-fuchsia-500 to-pink-500" },
                { brand: "Northwave Audio", match: 88, color: "from-cyan-500 to-blue-500" },
              ].map((c) => (
                <div key={c.brand} className="rounded-lg glass-subtle p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-body text-[11px] font-semibold text-[#0a0e27]">
                      {c.brand}
                    </span>
                    <span className="font-display text-[12px] font-semibold text-[#0a0e27]">
                      {c.match}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full bg-gradient-to-r ${c.color}`}
                      style={{ width: `${c.match}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Trending audio (2 cols) */}
          <BentoCard
            delay={0.2}
            className="md:col-span-2"
            icon={Music2}
            iconAccent="from-violet-500 to-fuchsia-500"
            glow="rgba(167,139,250,0.35)"
            title="Trending Reels Audio"
            description="Catch viral tracks while they're still climbing."
          >
            <div className="mt-4 flex items-end gap-1 h-14">
              {Array.from({ length: 26 }).map((_, i) => (
                <span
                  key={i}
                  className="audio-bar flex-1 rounded-full bg-gradient-to-t from-violet-500 to-fuchsia-400"
                  style={{
                    height: `${20 + ((i * 13) % 80)}%`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>
          </BentoCard>

          {/* Community (2 cols) */}
          <BentoCard
            delay={0.26}
            className="md:col-span-2"
            icon={Users}
            iconAccent="from-emerald-500 to-cyan-500"
            glow="rgba(52,211,153,0.30)"
            title="Community Network"
            description="Niche creator spaces with always-on AI matchmaking."
          >
            <div className="mt-4 flex -space-x-2">
              {["FP", "DR", "AC", "MR", "+"].map((label, i) => (
                <span
                  key={i}
                  className={`grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-[#0a0e27] ring-2 ring-white ${
                    i === 0
                      ? "bg-gradient-to-br from-fuchsia-500 to-pink-500"
                      : i === 1
                      ? "bg-gradient-to-br from-indigo-500 to-violet-500"
                      : i === 2
                      ? "bg-gradient-to-br from-cyan-500 to-blue-500"
                      : i === 3
                      ? "bg-gradient-to-br from-amber-500 to-orange-500"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="font-body mt-3 text-[11px] text-slate-500">
              <span className="font-bold text-emerald-700">814 creators</span> online now
            </div>
          </BentoCard>

          {/* Tips (2 cols) */}
          <BentoCard
            delay={0.32}
            className="md:col-span-2"
            icon={Lightbulb}
            iconAccent="from-amber-500 to-orange-500"
            glow="rgba(251,191,36,0.30)"
            title="Tips & Playbooks"
            description="Tactical guides on growth, monetization, and the algorithm."
          >
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Hooks", "Algorithm", "Brand deals", "Reels", "Monetize"].map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="font-body mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0a0e27]">
              <TrendingUp size={11} className="text-emerald-500" /> 142 articles · Updated weekly
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function BentoCard({
  icon: Icon,
  title,
  description,
  iconAccent,
  glow,
  children,
  className = "",
  delay = 0,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.55, delay }}
      className={className}
    >
      <GlassCard className="group relative h-full overflow-hidden p-6">
        {glow && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-90"
            style={{
              background: `radial-gradient(circle, ${glow}, transparent 70%)`,
              filter: "blur(40px)",
            }}
          />
        )}
        <div className="relative">
          <div
            className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${iconAccent} shadow-[0_10px_24px_-8px_rgba(99,102,241,0.45)]`}
          >
            <Icon size={18} className="text-[#0a0e27]" />
          </div>
          <h3 className="font-display mt-4 text-lg font-semibold tracking-[-0.02em] text-[#0a0e27]">
            {title}
          </h3>
          <p className="font-body mt-1.5 text-[13px] leading-relaxed text-slate-600">
            {description}
          </p>
          {children}
        </div>
      </GlassCard>
    </motion.div>
  );
}

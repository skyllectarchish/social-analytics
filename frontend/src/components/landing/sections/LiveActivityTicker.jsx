import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Flame,
  Heart,
  Music2,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const ITEMS = [
  { icon: Sparkles, accent: "from-amber-400 to-orange-500", label: "AI brief matched", value: "Aurora Beauty · 96%" },
  { icon: TrendingUp, accent: "from-emerald-500 to-teal-500", label: "Reel reach", value: "+312% in 24h" },
  { icon: Heart, accent: "from-fuchsia-500 to-pink-500", label: "Engagement spike", value: "+18.4%" },
  { icon: CheckCircle2, accent: "from-cyan-500 to-blue-500", label: "Payout cleared", value: "$2,840" },
  { icon: Music2, accent: "from-violet-500 to-fuchsia-500", label: "Audio trending", value: "Sunset Drift" },
  { icon: Users, accent: "from-indigo-500 to-violet-500", label: "Creators online", value: "814" },
  { icon: Flame, accent: "from-rose-500 to-orange-500", label: "Hot collab", value: "Northwave · live" },
  { icon: Activity, accent: "from-blue-500 to-indigo-500", label: "Reach forecast", value: "+24.7%" },
  { icon: Zap, accent: "from-yellow-400 to-orange-500", label: "Hook detected", value: "+24% retention" },
];

function Pill({ icon: Icon, accent, label, value }) {
  return (
    <div className="chip-soft inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-[12px] font-medium text-slate-700">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br ${accent} shadow-[0_4px_12px_-3px_rgba(99,102,241,0.45)]`}
      >
        <Icon size={11} className="text-white" />
      </span>
      <span className="font-body whitespace-nowrap text-slate-600">{label}</span>
      <span className="font-display font-semibold whitespace-nowrap text-[#0a0e27]">
        {value}
      </span>
    </div>
  );
}

export default function LiveActivityTicker() {
  return (
    <section aria-label="Live activity" className="relative isolate -mt-2 sm:-mt-4">
      <div className="relative mx-auto max-w-[100rem]">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden"
        >
          {/* Edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-[#fafafb] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-[#fafafb] to-transparent" />

          {/* Live dot */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.35)] backdrop-blur lg:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-500/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live network
          </div>

          <div
            className="flex w-max gap-3 px-6 py-4"
            style={{ animation: "marquee 50s linear infinite" }}
          >
            {[...ITEMS, ...ITEMS].map((it, i) => (
              <Pill key={i} {...it} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

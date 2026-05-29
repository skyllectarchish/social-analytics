import { motion } from "framer-motion";
import { Gauge, Bookmark, Share2, Layers } from "lucide-react";
import AnimatedCounter from "../landing/ui/AnimatedCounter";
import { useAlgorithmMetrics } from "../../hooks/useTier1Insights";

// Per-tile gradient + glow so the bento row reads as four distinct stats.
const ACCENTS = {
  violet: { bg: "linear-gradient(135deg,#7c3aed,#a855f7)", glow: "rgba(124,58,237,0.50)" },
  pink: { bg: "linear-gradient(135deg,#ec4899,#f472b6)", glow: "rgba(236,72,153,0.50)" },
  amber: { bg: "linear-gradient(135deg,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.50)" },
  sky: { bg: "linear-gradient(135deg,#0ea5e9,#22d3ee)", glow: "rgba(14,165,233,0.50)" },
};

// Mirrors AlgorithmScorePanel's composite: saves weighted over shares, /10.
function gaugeScore(summary) {
  if (!summary) return 0;
  return Math.min(
    10,
    (summary.account_save_rate ?? 0) * 0.6 + (summary.account_share_rate ?? 0) * 0.4,
  );
}

function StatTile({ icon: Icon, label, value, decimals = 0, suffix = "", accent, delay }) {
  const a = ACCENTS[accent] ?? ACCENTS.violet;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0, delay }}
      whileHover={{ y: -3 }}
      className="lab-card p-4 flex items-center gap-3.5"
    >
      <span
        className="grid place-items-center w-11 h-11 rounded-2xl text-white shrink-0"
        style={{
          background: a.bg,
          boxShadow: `0 6px 16px -4px ${a.glow}, inset 0 1px 0 rgba(255,255,255,0.45)`,
        }}
      >
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">
          {label}
        </p>
        <AnimatedCounter
          value={value}
          decimals={decimals}
          suffix={suffix}
          duration={1300}
          className="metric-value text-2xl text-slate-900 leading-none block mt-1"
        />
      </div>
    </motion.div>
  );
}

function SkeletonTile() {
  return (
    <div className="lab-card p-4 h-[84px] flex items-center">
      <div className="shimmer-line h-12 w-full rounded-xl opacity-40" />
    </div>
  );
}

export default function LabStatStrip() {
  const { data, loading, error } = useAlgorithmMetrics();

  if (error) return null; // the panels below surface the error

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  const summary = data?.summary;
  const posts = data?.posts ?? [];

  const tiles = [
    { icon: Gauge, label: "Algorithm Score", value: gaugeScore(summary), decimals: 1, suffix: " / 10", accent: "violet" },
    { icon: Bookmark, label: "Avg Save Rate", value: summary?.account_save_rate ?? 0, decimals: 2, suffix: "%", accent: "pink" },
    { icon: Share2, label: "Avg Share Rate", value: summary?.account_share_rate ?? 0, decimals: 2, suffix: "%", accent: "amber" },
    { icon: Layers, label: "Posts Analyzed", value: posts.length, decimals: 0, accent: "sky" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map((t, i) => (
        <StatTile key={t.label} {...t} delay={0.04 + i * 0.06} />
      ))}
    </div>
  );
}

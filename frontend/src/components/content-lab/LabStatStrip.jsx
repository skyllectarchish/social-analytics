import { motion } from "framer-motion";
import { Gauge, Bookmark, Share2, Layers } from "lucide-react";
import AnimatedCounter from "../landing/ui/AnimatedCounter";
import { useAlgorithmMetrics } from "../../hooks/useTier1Insights";

const ACCENTS = {
  violet: { bg: "linear-gradient(135deg,#7c3aed,#a855f7)", glow: "rgba(124,58,237,0.45)" },
  pink:   { bg: "linear-gradient(135deg,#ec4899,#f472b6)", glow: "rgba(236,72,153,0.45)" },
  amber:  { bg: "linear-gradient(135deg,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.45)" },
  sky:    { bg: "linear-gradient(135deg,#0ea5e9,#22d3ee)", glow: "rgba(14,165,233,0.45)" },
};

function gaugeScore(summary) {
  if (!summary) return 0;
  return Math.min(10, (summary.account_save_rate ?? 0) * 0.6 + (summary.account_share_rate ?? 0) * 0.4);
}

export default function LabStatStrip() {
  const { data, loading, error } = useAlgorithmMetrics();

  if (error) return null;

  if (loading) {
    return (
      <div className="lab-card flex overflow-hidden animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 flex items-center gap-3 px-5 py-3.5"
            style={{ borderLeft: i > 0 ? "1px solid rgba(15,23,42,0.06)" : "none" }}>
            <div className="w-8 h-8 rounded-xl shrink-0" style={{ background: "rgba(0,0,0,0.06)" }} />
            <div className="flex flex-col gap-1.5">
              <div className="h-2 w-14 rounded" style={{ background: "rgba(0,0,0,0.05)" }} />
              <div className="h-5 w-10 rounded" style={{ background: "rgba(0,0,0,0.07)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const summary = data?.summary;
  const posts = data?.posts ?? [];

  const tiles = [
    { icon: Gauge,   label: "Algorithm Score", value: gaugeScore(summary), decimals: 1, suffix: " / 10", accent: "violet" },
    { icon: Bookmark,label: "Avg Save Rate",    value: summary?.account_save_rate ?? 0,  decimals: 2, suffix: "%", accent: "pink" },
    { icon: Share2,  label: "Avg Share Rate",   value: summary?.account_share_rate ?? 0, decimals: 2, suffix: "%", accent: "amber" },
    { icon: Layers,  label: "Posts Analyzed",   value: posts.length,                     decimals: 0, suffix: "", accent: "sky" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0 }}
      className="lab-card flex overflow-hidden"
    >
      {tiles.map((tile, i) => {
        const a = ACCENTS[tile.accent] ?? ACCENTS.violet;
        const Icon = tile.icon;
        return (
          <div key={tile.label} className="flex-1 flex items-center gap-3 px-5 py-3.5"
            style={{ borderLeft: i > 0 ? "1px solid rgba(15,23,42,0.07)" : "none" }}>
            <span
              className="w-8 h-8 rounded-xl grid place-items-center text-white shrink-0"
              style={{ background: a.bg, boxShadow: `0 4px 10px -3px ${a.glow}` }}
            >
              <Icon size={14} strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-semibold mb-0.5">
                {tile.label}
              </p>
              <AnimatedCounter
                value={tile.value}
                decimals={tile.decimals}
                suffix={tile.suffix}
                duration={1200}
                className="metric-value text-[1.2rem] text-slate-900 leading-none block"
              />
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

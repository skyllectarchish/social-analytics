import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useDashboard } from "../../hooks/useInsights";
import { pctDelta, unwrapComparison } from "../../utils/stats";

function fmtNum(v) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// Hairline dividers for the 2x2 (mobile) → 4-across (sm+) metric strip.
// Mobile: vertical rule between columns + horizontal rule between rows.
// sm+: a single row, so only vertical rules between the four cells.
const CELL_BORDER = [
  "",
  "border-l border-slate-100",
  "border-t border-slate-100 sm:border-t-0 sm:border-l",
  "border-t border-l border-slate-100 sm:border-t-0",
];

const CARDS = [
  {
    key: "total_views",
    label: "Views",
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.05)",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: "total_reach",
    label: "Reach",
    color: "#06B6D4",
    bg: "rgba(6,182,212,0.05)",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    key: "total_interactions",
    label: "Interactions",
    color: "#EC4899",
    bg: "rgba(236,72,153,0.05)",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    key: "net_follower_growth",
    label: "Followers",
    color: "#10B981",
    bg: "rgba(16,185,129,0.05)",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
];

export default function HeroCards({ sparklines = {} }) {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <div className="d-card grid grid-cols-2 sm:grid-cols-4 overflow-hidden animate-pulse">
        {CARDS.map((c, i) => (
          <div
            key={c.key}
            className={`px-5 py-3.5 flex flex-col gap-2 ${CELL_BORDER[i]}`}
          >
            <div className="h-2 w-12 rounded" style={{ background: "rgba(0,0,0,0.05)" }} />
            <div className="flex items-center gap-2">
              <div className="h-5 w-14 rounded" style={{ background: "rgba(0,0,0,0.07)" }} />
              <div className="h-4 w-10 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="d-card px-5 py-3.5 text-sm" style={{ color: "#94A3B8" }}>
        {error || "No data. Run a sync first."}
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key="content"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.45, bounce: 0 }}
        className="d-card grid grid-cols-2 sm:grid-cols-4 overflow-hidden"
      >
        {CARDS.map((card, i) => {
          const { current: value, prior, deltaPct: rawDelta } = unwrapComparison(data[card.key]);
          const deltaPct = rawDelta ?? pctDelta(value, prior);
          const hasCompare = prior != null;
          const isGrowth = card.key === "net_follower_growth";
          const isNegative = isGrowth && value < 0;
          const displayColor = isNegative ? "#F43F5E" : card.color;
          const sparkData = sparklines[card.key] ?? [];
          const deltaColor =
            deltaPct == null ? "#94A3B8"
            : deltaPct > 0 ? "#059669"
            : deltaPct < 0 ? "#DC2626"
            : "#94A3B8";
          const DeltaIcon = deltaPct == null ? null : deltaPct >= 0 ? TrendingUp : TrendingDown;

          return (
            <div
              key={card.key}
              className={`relative overflow-hidden px-5 py-3.5 ${CELL_BORDER[i]}`}
            >
              {/* bg tint */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: card.bg }} />

              {/* sparkline — right half, very faint background */}
              {sparkData.length > 0 && (
                <div
                  className="absolute inset-y-0 right-0 pointer-events-none"
                  style={{ width: "50%", opacity: 0.18 }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                      <Line type="monotone" dataKey="v" stroke={card.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* metric content */}
              <div className="relative flex items-center justify-between gap-2">
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "#94A3B8", marginBottom: 3 }}>
                    {card.label}
                  </p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="metric-value" style={{ fontSize: "1.25rem", lineHeight: 1, color: displayColor }}>
                      {isGrowth && value > 0 && "+"}{fmtNum(value)}
                    </span>
                    {hasCompare && deltaPct != null && DeltaIcon && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 2,
                        fontSize: 9, fontWeight: 700, color: deltaColor,
                        background: `${deltaColor}12`, padding: "2px 5px", borderRadius: 4,
                      }}>
                        <DeltaIcon size={8} />
                        {isFinite(deltaPct) ? `${Math.abs(deltaPct).toFixed(1)}%` : "—"}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${displayColor}10`, color: displayColor,
                }}>
                  {card.icon}
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}

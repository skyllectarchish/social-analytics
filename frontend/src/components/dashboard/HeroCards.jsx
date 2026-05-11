import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { useDashboard } from "../../hooks/useInsights";

function fmtNum(v) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

const CARDS = [
  {
    key: "total_views",
    label: "Total Views",
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
    glowClass: "glow-violet",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: "total_reach",
    label: "Reach",
    color: "#06B6D4",
    bg: "rgba(6,182,212,0.08)",
    glowClass: "glow-cyan",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    key: "total_interactions",
    label: "Interactions",
    color: "#EC4899",
    bg: "rgba(236,72,153,0.08)",
    glowClass: "glow-pink",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    key: "net_follower_growth",
    label: "Follower Growth",
    color: "#10B981",
    bg: "rgba(16,185,129,0.08)",
    glowClass: "glow-emerald",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
];

function Sparkline({ data, color }) {
  if (!data?.length) return null;
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 58, opacity: 0.5, pointerEvents: "none" }}>
      <ResponsiveContainer width="100%" height={58}>
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive
            animationDuration={1000}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
      {/* fade top edge to blend with white card */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 22,
          background: "linear-gradient(to bottom, #FFFFFF, transparent)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse d-card"
      style={{ minHeight: 160, position: "relative", overflow: "hidden" }}
    >
      <div className="w-9 h-9 rounded-xl mb-4" style={{ background: "rgba(0,0,0,0.06)" }} />
      <div className="h-8 w-24 rounded-lg mb-2" style={{ background: "rgba(0,0,0,0.06)" }} />
      <div className="h-3 w-16 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
    </div>
  );
}

export default function HeroCards({ days, sparklines = {} }) {
  const { data, loading, error } = useDashboard(days);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {CARDS.map((c) => <SkeletonCard key={c.key} />)}
        </motion.div>
      ) : error || !data ? (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-6 text-center text-sm d-card"
          style={{ color: "#64748B" }}
        >
          {error || "No data. Run a sync first."}
        </motion.div>
      ) : (
        <motion.div key="content" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {CARDS.map((card, i) => {
            const value = data[card.key] ?? 0;
            const isGrowth = card.key === "net_follower_growth";
            const isNegative = isGrowth && value < 0;
            const displayColor = isNegative ? "#F43F5E" : card.color;
            const sparkData = sparklines[card.key] ?? [];

            return (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", duration: 0.5, bounce: 0, delay: i * 0.08 }}
                whileHover={{ scale: 1.025, transition: { duration: 0.15 } }}
                className={`d-card ${card.glowClass} cursor-default`}
                style={{ padding: "1.25rem", position: "relative", overflow: "hidden", minHeight: 160 }}
              >
            {/* tinted bg wash */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background: card.bg,
                opacity: 0.5,
                pointerEvents: "none",
                borderRadius: "inherit",
              }}
            />

            {/* Icon + change badge row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, position: "relative" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `${displayColor}18`,
                  border: `1px solid ${displayColor}25`,
                  color: displayColor,
                }}
              >
                {card.icon}
              </div>
              {isGrowth && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: !isNegative ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
                    color: !isNegative ? "#059669" : "#DC2626",
                    border: `1px solid ${!isNegative ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}`,
                  }}
                >
                  {!isNegative ? "▲" : "▼"} {Math.abs(value).toLocaleString()}
                </span>
              )}
            </div>

            {/* Metric value */}
            <div
              className="metric-value"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: displayColor, lineHeight: 1.1, marginBottom: 4, position: "relative" }}
            >
              {isGrowth && value > 0 && "+"}
              {fmtNum(value)}
            </div>

            {/* Label */}
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#94A3B8",
                position: "relative",
              }}
            >
              {card.label}
            </p>

            {/* Sparkline pinned to bottom */}
            <Sparkline data={sparkData} color={displayColor} />
          </motion.div>
        );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

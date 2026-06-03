import { Gauge, Sparkles as SparklesIcon, Moon, Users, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { useFollowerQualitySummary } from "../../hooks/useTier1Insights";
import { pctDelta, unwrapComparison } from "../../utils/stats";

const CARDS = [
  { key: "overall_quality_pct",    label: "Quality Score",        iconColor: "#8b5cf6", Icon: Gauge,        suffix: "%",  decimals: 1 },
  { key: "high_quality_cohorts",   label: "High-Quality Cohorts", iconColor: "#10b981", Icon: SparklesIcon, suffix: "",   decimals: 0 },
  { key: "dormant_cohorts",        label: "Dormant Cohorts",      iconColor: "#f43f5e", Icon: Moon,         suffix: "",   decimals: 0 },
  { key: "total_followers_tracked",label: "Followers Tracked",    iconColor: "#64748b", Icon: Users,        suffix: "",   decimals: 0 },
];

function fmtVal(v, decimals, suffix) {
  if (v == null || v === "") return "—";
  const num = typeof v === "object" ? unwrapComparison(v).current : v;
  if (num == null) return "—";
  const abs = Math.abs(num);
  if (decimals === 0 && abs >= 1000) return `${(num / 1000).toFixed(1)}K${suffix}`;
  return `${Number(num).toFixed(decimals)}${suffix}`;
}

export default function QualityHeroMetrics({ breakdown = "age" }) {
  const { data, loading, error } = useFollowerQualitySummary(breakdown);

  if (loading) {
    return (
      <div className="d-card flex overflow-hidden animate-pulse">
        {CARDS.map((c, i) => (
          <div key={c.key} className="flex-1 px-5 py-3.5 flex flex-col gap-2"
            style={{ borderLeft: i > 0 ? "1px solid rgba(15,23,42,0.06)" : "none" }}>
            <div className="h-2 w-14 rounded" style={{ background: "rgba(0,0,0,0.05)" }} />
            <div className="h-5 w-12 rounded" style={{ background: "rgba(0,0,0,0.07)" }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="d-card px-5 py-3.5 text-xs" style={{ color: "#f43f5e" }}>{error}</div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0 }}
      className="d-card flex overflow-hidden"
    >
      {CARDS.map((card, i) => {
        const raw = data?.[card.key] ?? 0;
        const { current, prior, deltaPct: rawDelta } = unwrapComparison(raw);
        const deltaPct = rawDelta ?? pctDelta(current, prior);
        const hasCompare = prior != null;
        const deltaColor = deltaPct == null ? "#94A3B8" : deltaPct > 0 ? "#059669" : deltaPct < 0 ? "#DC2626" : "#94A3B8";
        const DeltaIcon = deltaPct == null ? null : deltaPct >= 0 ? TrendingUp : TrendingDown;
        const Icon = card.Icon;

        return (
          <div key={card.key} className="flex-1 relative overflow-hidden px-5 py-3.5"
            style={{ borderLeft: i > 0 ? "1px solid rgba(15,23,42,0.06)" : "none" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: `${card.iconColor}05` }} />
            <div className="relative flex items-center justify-between gap-2">
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "#94A3B8", marginBottom: 3 }}>
                  {card.label}
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="metric-value" style={{ fontSize: "1.25rem", lineHeight: 1, color: card.iconColor }}>
                    {fmtVal(raw, card.decimals, card.suffix)}
                  </span>
                  {hasCompare && deltaPct != null && DeltaIcon && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, color: deltaColor, background: `${deltaColor}12`, padding: "2px 5px", borderRadius: 4 }}>
                      <DeltaIcon size={8} />
                      {isFinite(deltaPct) ? `${Math.abs(deltaPct).toFixed(1)}%` : "—"}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${card.iconColor}10`, color: card.iconColor }}>
                <Icon size={13} strokeWidth={2} />
              </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

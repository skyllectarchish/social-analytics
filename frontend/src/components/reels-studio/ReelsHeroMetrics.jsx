import { useMemo } from "react";
import { Zap, Clock, SkipForward, Repeat, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useReelsRetention } from "../../hooks/useTier1Insights";
import { pctDelta, unwrapComparison, welchsTTest } from "../../utils/stats";

function avg(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((sum, r) => sum + (r[key] ?? 0), 0) / arr.length;
}

function variance(arr, key, mean) {
  if (arr.length < 2) return 0;
  return arr.reduce((s, r) => s + ((r[key] ?? 0) - mean) ** 2, 0) / (arr.length - 1);
}

const CARDS = [
  { key: "hook",   label: "Hook Strength", iconColor: "#8b5cf6", Icon: Zap,         suffix: "%", decimals: 1 },
  { key: "watch",  label: "Watch Time",    iconColor: "#06b6d4", Icon: Clock,        suffix: "s", decimals: 1 },
  { key: "skip",   label: "Skip Rate",     iconColor: "#ec4899", Icon: SkipForward,  suffix: "%", decimals: 1 },
  { key: "replay", label: "Replay Rate",   iconColor: "#10b981", Icon: Repeat,       suffix: "%", decimals: 2 },
];

export default function ReelsHeroMetrics() {
  const { data, loading, error } = useReelsRetention();

  const values = useMemo(() => {
    const reels = data?.reels ?? [];
    const priorReels = data?.prior?.reels;
    const KEY_MAP = { hook: "hook_strength_pct", watch: "avg_watch_time", skip: "skip_rate", replay: "estimated_replay_rate" };
    const compute = (arr) => Object.fromEntries(Object.entries(KEY_MAP).map(([k, col]) => [k, avg(arr, col)]));
    const current = compute(reels);
    if (!priorReels) return current;
    const prior = compute(priorReels);
    return Object.fromEntries(
      Object.entries(current).map(([k, v]) => {
        const col = KEY_MAP[k];
        const vCur = variance(reels, col, v);
        const vPrior = variance(priorReels, col, prior[k]);
        const { significant } = welchsTTest(v, vCur, reels.length, prior[k], vPrior, priorReels.length);
        return [k, { current: v, prior: prior[k], delta_pct: null, significant }];
      }),
    );
  }, [data]);

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
        const { current, prior, deltaPct: rawDelta, significant } = unwrapComparison(values[card.key]);
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
                    {current != null ? `${current.toFixed(card.decimals)}${card.suffix}` : "—"}
                  </span>
                  {hasCompare && deltaPct != null && DeltaIcon && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700, color: deltaColor, background: `${deltaColor}12`, padding: "2px 5px", borderRadius: 4 }}>
                      <DeltaIcon size={8} />
                      {isFinite(deltaPct) ? `${Math.abs(deltaPct).toFixed(1)}%` : "—"}
                      {significant && <Sparkles size={7} />}
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

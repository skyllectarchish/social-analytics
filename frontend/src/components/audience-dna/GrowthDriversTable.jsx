import { motion } from "framer-motion";
import { TrendingUp, Film, Image as ImageIcon } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import MediaThumb from "../shared/MediaThumb";
import { SkeletonChart } from "../shared/Skeleton";
import { useGrowthDrivers } from "../../hooks/useGrowthDrivers";

function fmtNum(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function convRateColor(pct) {
  if (pct >= 2) return { bg: "rgba(16,185,129,0.12)", color: "#059669" };
  if (pct >= 0.5) return { bg: "rgba(245,158,11,0.12)", color: "#d97706" };
  return { bg: "rgba(100,116,139,0.10)", color: "#475569" };
}

export default function GrowthDriversTable({ onSelectPost }) {
  const { data, loading, error } = useGrowthDrivers(10);

  if (loading) return <SkeletonChart height="h-[320px]" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const drivers = data?.drivers ?? [];

  return (
    <AnimatedCard className="p-5" delay={0.1}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-start gap-2">
          <TrendingUp size={14} className="text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Growth Drivers
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Top posts ranked by attributed follower acquisition (24h window).
            </p>
          </div>
        </div>
      </div>

      {drivers.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-slate-600 font-medium">
            No driver activity yet
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Needs at least 7 days of follower history.
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
          {drivers.map((d, i) => {
            const isReel = d.media_product_type === "REELS";
            const TypeIcon = isReel ? Film : ImageIcon;
            const conv = convRateColor(d.conversion_rate_pct ?? 0);
            return (
              <motion.button
                key={d.ig_media_id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: i * 0.04,
                  type: "spring",
                  duration: 0.4,
                  bounce: 0,
                }}
                onClick={() => onSelectPost?.(d)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
              >
                <span className="w-5 text-[11px] font-mono text-slate-400 text-right shrink-0">
                  #{i + 1}
                </span>
                <MediaThumb
                  mediaId={d.ig_media_id}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                  style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                  fallback={<div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0"
                      style={{
                        background: isReel
                          ? "rgba(236,72,153,0.10)"
                          : "rgba(59,130,246,0.10)",
                        color: isReel ? "#db2777" : "#2563eb",
                      }}
                    >
                      <TypeIcon size={9} />
                      {isReel ? "Reel" : "Post"}
                    </span>
                    <p className="text-xs text-slate-800 truncate">
                      {d.caption || "(no caption)"}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    reach {fmtNum(d.reach)} · conv{" "}
                    <span
                      className="font-mono font-semibold px-1 py-0.5 rounded"
                      style={{ background: conv.bg, color: conv.color }}
                    >
                      {(d.conversion_rate_pct ?? 0).toFixed(2)}%
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-semibold text-emerald-600">
                    +{Math.round(d.attributed_follows ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-400">followers</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {drivers.length > 0 && (
        <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
          Attribution is a share of the day's follower gain, not a causal claim.
          Rates use non-follower reach when available.
        </p>
      )}
    </AnimatedCard>
  );
}

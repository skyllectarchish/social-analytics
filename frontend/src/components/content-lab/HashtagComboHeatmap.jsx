import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import SectionCard from "../shared/SectionCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useHashtagCombos } from "../../hooks/useHashtags";

export default function HashtagComboHeatmap() {
  const { data, loading, error } = useHashtagCombos(2);

  if (loading) return <SkeletonChart height="h-44" />;

  const combos = (data?.data ?? []).slice(0, 12);
  // Real median of avg_engagement_pct across the top combos, used to decide
  // which combos earn the "above-average" badge. The previous implementation
  // indexed combos[len/2] directly which is just an arbitrary mid-rank value,
  // not the median, making the badge thresholds essentially random.
  const median = (() => {
    if (!combos.length) return 0;
    const sorted = [...combos]
      .map((c) => Number(c.avg_engagement_pct) || 0)
      .sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  })();

  return (
    <SectionCard
      icon={Sparkles}
      title="Hashtag combos that overperform"
      subtitle="Pairs co-occurring on multiple posts, ranked by combined engagement."
      delay={0.15}
    >
      {error ? (
        <p className="text-xs text-rose-500 py-6 text-center">{error}</p>
      ) : combos.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          No co-occurring hashtag pairs detected yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {combos.map((c, i) => {
            const isAbove = c.avg_engagement_pct > median;
            return (
              <motion.div
                key={`${c.tag_a}|${c.tag_b}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: i * 0.04,
                  type: "spring",
                  duration: 0.45,
                  bounce: 0,
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px]"
                style={{
                  background: isAbove
                    ? "rgba(16,185,129,0.06)"
                    : "rgba(244,63,94,0.04)",
                  borderColor: isAbove
                    ? "rgba(16,185,129,0.2)"
                    : "rgba(244,63,94,0.15)",
                }}
              >
                <span className="text-violet-700 font-medium">#{c.tag_a}</span>
                <span className="text-slate-300">+</span>
                <span className="text-violet-700 font-medium">#{c.tag_b}</span>
                <span
                  className={
                    isAbove
                      ? "text-emerald-700 font-semibold font-mono"
                      : "text-rose-600 font-semibold font-mono"
                  }
                >
                  {c.avg_engagement_pct.toFixed(1)}%
                </span>
                <span className="text-slate-400 font-mono">
                  ×{c.cooccurrence_count}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

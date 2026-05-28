import { motion } from "framer-motion";
import { Hash, TrendingUp, Flame, Snowflake, Sparkles } from "lucide-react";
import SectionCard from "../shared/SectionCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useTopHashtags } from "../../hooks/useHashtags";

function fmtNum(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

//: Tag's engagement rate must shift by at least this many percentage points
//: vs. prior period before we flag it as rising/cooling. Below the threshold
//: a tag stays "steady" — avoids a wave of badges on noise.
const FRESHNESS_DELTA_PP = 1.0;

function freshness(current, prior) {
  if (current == null) return null;
  if (prior == null) return "new";
  const delta = (current.avg_engagement_rate_pct ?? 0) - (prior.avg_engagement_rate_pct ?? 0);
  if (delta > FRESHNESS_DELTA_PP) return "rising";
  if (delta < -FRESHNESS_DELTA_PP) return "cooling";
  return "steady";
}

const FRESHNESS_META = {
  rising: { label: "Rising", color: "text-emerald-700 bg-emerald-50 border-emerald-200", Icon: Flame },
  cooling: { label: "Cooling", color: "text-slate-500 bg-slate-50 border-slate-200", Icon: Snowflake },
  new: { label: "New", color: "text-violet-700 bg-violet-50 border-violet-200", Icon: Sparkles },
};

export default function HashtagPerformanceTable({ selected, onSelect }) {
  const { data, loading, error } = useTopHashtags(30, 2);

  if (loading) return <SkeletonChart height="h-[420px]" />;

  const tags = data?.data ?? [];
  const priorByTag = new Map(
    (data?.prior?.data ?? []).map((t) => [t.hashtag, t]),
  );

  return (
    <SectionCard
      icon={Hash}
      title="Top Hashtags"
      subtitle="By average engagement rate across your posts."
      delay={0.05}
    >
      {error ? (
        <p className="text-xs text-rose-500 py-8 text-center">{error}</p>
      ) : tags.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-slate-600 font-medium">No hashtags tracked yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Need at least 2 posts sharing a hashtag for it to appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5 max-h-[360px] overflow-y-auto pr-1">
          {tags.map((t, i) => {
            const isSelected = selected === t.hashtag;
            return (
              <motion.button
                key={t.hashtag}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: i * 0.02,
                  type: "spring",
                  duration: 0.3,
                  bounce: 0,
                }}
                onClick={() => onSelect?.(t.hashtag)}
                className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left ${
                  isSelected ? "bg-violet-50" : "hover:bg-slate-50"
                }`}
                style={
                  isSelected
                    ? { boxShadow: "inset 2px 0 0 #8b5cf6" }
                    : undefined
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-slate-400 w-5 text-right shrink-0">
                    #{i + 1}
                  </span>
                  <span className="text-xs text-violet-700 font-medium truncate">
                    #{t.hashtag}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {t.post_count} posts
                  </span>
                  {(() => {
                    if (!data?.prior) return null;
                    const status = freshness(t, priorByTag.get(t.hashtag));
                    if (!status || status === "steady") return null;
                    const meta = FRESHNESS_META[status];
                    const Icon = meta.Icon;
                    return (
                      <span
                        className={`flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border ${meta.color} shrink-0`}
                      >
                        <Icon size={9} />
                        {meta.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                  <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                    <TrendingUp size={10} />
                    {(t.avg_engagement_rate_pct ?? 0).toFixed(1)}%
                  </span>
                  <span className="text-slate-400 w-12 text-right">
                    {fmtNum(t.avg_reach)}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

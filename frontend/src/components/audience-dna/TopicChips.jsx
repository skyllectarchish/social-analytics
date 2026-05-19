import { motion } from "framer-motion";
import { Tag, HelpCircle } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useTopics } from "../../hooks/useSentiment";

export default function TopicChips() {
  const { data, loading, error } = useTopics();

  if (loading) return <SkeletonChart height="h-[260px]" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const topics = data?.topics ?? [];
  const maxSize = topics.reduce((m, t) => Math.max(m, t.size ?? 0), 0);

  return (
    <AnimatedCard className="p-5" delay={0.1}>
      <div className="flex items-start gap-2 mb-3">
        <Tag size={14} className="text-violet-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            What your audience is talking about
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Topics clustered from analysed comments.
          </p>
        </div>
      </div>

      {topics.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          Need at least 50 analysed comments to detect topics.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topics.map((t, i) => {
            const intensity =
              maxSize > 0 ? Math.min(1, (t.size ?? 0) / maxSize) : 0;
            const bg = `rgba(139,92,246,${(0.04 + intensity * 0.16).toFixed(3)})`;
            const border = `rgba(139,92,246,${(0.15 + intensity * 0.2).toFixed(3)})`;
            return (
              <motion.div
                key={t.cluster_id ?? t.label ?? i}
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: i * 0.04,
                  type: "spring",
                  duration: 0.4,
                  bounce: 0,
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] border"
                style={{ background: bg, borderColor: border }}
              >
                <span className="text-slate-800 font-medium">{t.label}</span>
                <span className="text-slate-400 font-mono">{t.size ?? 0}</span>
                {t.is_question && (
                  <HelpCircle size={11} className="text-amber-500" />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </AnimatedCard>
  );
}

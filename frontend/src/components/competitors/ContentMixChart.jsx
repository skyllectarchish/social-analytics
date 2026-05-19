import { motion } from "framer-motion";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useContentMix } from "../../hooks/useCompetitors";

const SEGMENTS = [
  { key: "reels", label: "Reels", color: "#ec4899" },
  { key: "carousel", label: "Carousel", color: "#8b5cf6" },
  { key: "image", label: "Image", color: "#94a3b8" },
];

function pct(v) {
  return `${Math.round((v ?? 0) * 100)}%`;
}

export default function ContentMixChart() {
  const { data, loading, error } = useContentMix();

  if (loading) return <SkeletonChart height="h-[260px]" />;
  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const accounts = data?.accounts ?? [];

  return (
    <AnimatedCard className="p-5" delay={0.15}>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Content mix</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Format distribution for posts published in the current period.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="text-xs text-slate-400 py-10 text-center">
          Add competitors to see their content mix.
        </p>
      ) : (
        <div className="space-y-2.5">
          {accounts.map((a, i) => {
            const mix = a.mix ?? {};
            const isSelf = a.handle === "you";
            return (
              <motion.div
                key={a.handle}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: i * 0.04,
                  type: "spring",
                  duration: 0.4,
                  bounce: 0,
                }}
                className="flex items-center gap-3"
              >
                <div className="w-24 shrink-0 text-xs">
                  {isSelf ? (
                    <span className="text-violet-700 font-semibold">You</span>
                  ) : (
                    <span className="text-slate-700 truncate block">
                      @{a.handle}
                    </span>
                  )}
                </div>
                <div
                  className="flex-1 h-6 rounded-md overflow-hidden flex"
                  style={{ background: "rgba(15,23,42,0.04)" }}
                >
                  {SEGMENTS.map((s) => {
                    const v = mix[s.key] ?? 0;
                    if (v === 0) return null;
                    return (
                      <motion.div
                        key={s.key}
                        initial={{ width: 0 }}
                        animate={{ width: `${v * 100}%` }}
                        transition={{
                          delay: 0.1 + i * 0.04,
                          type: "spring",
                          duration: 0.6,
                          bounce: 0,
                        }}
                        style={{
                          background: s.color,
                          height: "100%",
                        }}
                        title={`${s.label} · ${pct(v)}`}
                      />
                    );
                  })}
                </div>
                <div className="w-32 shrink-0 flex items-center justify-end gap-2 text-[10px] font-mono text-slate-500">
                  {SEGMENTS.map((s) => (
                    <span key={s.key} style={{ color: s.color }}>
                      {pct(mix[s.key])}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </AnimatedCard>
  );
}

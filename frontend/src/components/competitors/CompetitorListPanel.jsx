import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Star, AlertTriangle } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import { useCompetitors } from "../../hooks/useCompetitors";

const MAX_COMPETITORS = 10;
//: Matches `competitor_repo.MAX_CONSECUTIVE_FAILURES`. A handle is
//: auto-soft-deleted once it hits this count. We surface a warning chip on
//: anything >= 1 so the user sees the drift before the handle disappears.
const STALE_FAILURE_THRESHOLD = 3;

function fmtNum(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export default function CompetitorListPanel({ onAdd }) {
  const { data, loading, error, remove } = useCompetitors();

  if (loading) return <SkeletonChart height="h-[420px]" />;

  const list = data?.competitors ?? [];
  const you = data?.you;
  const canAddMore = list.length < MAX_COMPETITORS;

  return (
    <AnimatedCard className="p-4" delay={0.05}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Tracking</h3>
        <button
          onClick={onAdd}
          disabled={!canAddMore}
          className="text-[11px] flex items-center gap-1 text-violet-600 font-medium hover:text-violet-700 disabled:text-slate-300 disabled:cursor-not-allowed"
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-500 py-2 mb-2">{error}</p>
      )}

      <div className="space-y-1">
        <motion.div
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0 }}
          className="flex items-center gap-3 p-2 rounded-lg border"
          style={{
            background: "rgba(139,92,246,0.06)",
            borderColor: "rgba(139,92,246,0.2)",
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(139,92,246,0.15)" }}
          >
            <Star size={14} className="text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-800">You</p>
            <p className="text-[10px] text-violet-600 font-mono">
              {fmtNum(you?.followers_count)} followers
            </p>
          </div>
        </motion.div>

        <AnimatePresence initial={false}>
          {list.map((c, i) => (
            <motion.div
              key={c.handle}
              layout
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4, height: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{
                delay: i * 0.04,
                type: "spring",
                duration: 0.4,
                bounce: 0,
              }}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 group"
            >
              {c.profile_picture_url ? (
                <img
                  src={c.profile_picture_url}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                  style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    @{c.handle}
                  </p>
                  {(c.consecutive_failures ?? 0) >= 1 && (
                    <span
                      title={
                        `Last ${c.consecutive_failures} daily sync${
                          c.consecutive_failures === 1 ? "" : "s"
                        } failed — data may be stale. Auto-removed after ${STALE_FAILURE_THRESHOLD}.`
                      }
                      className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-50 border border-amber-200"
                    >
                      <AlertTriangle size={9} />
                      {c.consecutive_failures}/{STALE_FAILURE_THRESHOLD}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  {fmtNum(c.latest_snapshot?.followers_count)} followers
                </p>
              </div>
              <button
                onClick={() => remove(c.handle)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50"
                aria-label={`Remove ${c.handle}`}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {list.length === 0 && !error && (
          <p className="text-xs text-slate-400 text-center py-6">
            Add up to {MAX_COMPETITORS} competitors to compare.
          </p>
        )}
      </div>
    </AnimatedCard>
  );
}

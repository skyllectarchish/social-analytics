import { motion } from "framer-motion";
import { HelpCircle, ExternalLink } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import MediaThumb from "../shared/MediaThumb";
import { SkeletonChart } from "../shared/Skeleton";
import { useQuestionPosts } from "../../hooks/useSentiment";

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function QuestionPostsCard({ onSelect }) {
  const { data, loading, error } = useQuestionPosts(8);

  if (loading) return <SkeletonChart height="h-[260px]" />;

  if (error) {
    return (
      <AnimatedCard className="p-5">
        <p className="text-xs text-rose-500">{error}</p>
      </AnimatedCard>
    );
  }

  const posts = data?.posts ?? [];

  return (
    <AnimatedCard className="p-5" delay={0.14}>
      <div className="flex items-start gap-2 mb-3">
        <HelpCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Posts that sparked questions
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Top FAQ opportunities — make a follow-up or a reels series.
          </p>
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="text-xs text-slate-400 py-10 text-center">
          No question comments detected in the current period.
        </p>
      ) : (
        <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
          {posts.map((p, i) => (
            <motion.button
              key={p.ig_media_id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: i * 0.04,
                type: "spring",
                duration: 0.35,
                bounce: 0,
              }}
              onClick={() => onSelect?.(p)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
            >
              <MediaThumb
                mediaId={p.ig_media_id}
                alt=""
                className="w-10 h-10 rounded-lg object-cover shrink-0"
                style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                fallback={<div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-800 truncate">
                  {p.caption || "(no caption)"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {fmtDate(p.timestamp)} · {p.total_comments} comments
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-semibold text-amber-600">
                  {p.question_count}
                </p>
                <p className="text-[10px] text-slate-400">questions</p>
              </div>
              {p.permalink && (
                <a
                  href={p.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-400 hover:text-violet-600 p-1 rounded"
                  aria-label="Open on Instagram"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </AnimatedCard>
  );
}

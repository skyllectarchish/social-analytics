import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { trackAI } from "../../utils/telemetry";
import MediaThumb from "../shared/MediaThumb";
import {
  RefreshCcw,
  Loader2,
  Lightbulb,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { useContentIdeas } from "../../hooks/useContentIdeas";
import { useAIQuota } from "../../hooks/useAIQuota";
import IdeaCard from "./IdeaCard";
import AIEmptyState from "./AIEmptyState";

const DAY_OPTIONS = [30, 90, 180];

function IdeasGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-2xl p-4 bg-white space-y-3"
          style={{ border: "1px solid rgba(15,23,42,0.06)", boxShadow: "var(--shadow-soft)" }}
          aria-hidden="true"
        >
          <div className="h-3 w-16 rounded" style={{ background: "rgba(15,23,42,0.06)" }} />
          <div className="h-4 w-3/4 rounded" style={{ background: "rgba(15,23,42,0.08)" }} />
          <div className="h-3 w-full rounded" style={{ background: "rgba(15,23,42,0.06)" }} />
          <div className="h-3 w-5/6 rounded" style={{ background: "rgba(15,23,42,0.06)" }} />
        </div>
      ))}
    </div>
  );
}

function ThemeChips({ themes }) {
  if (!themes?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {themes.map((t) => (
        <span
          key={t}
          className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{
            background: "rgba(139,92,246,0.08)",
            color: "#7c3aed",
            border: "1px solid rgba(139,92,246,0.18)",
          }}
        >
          #{t}
        </span>
      ))}
    </div>
  );
}

function SourcePostsStrip({ posts, onClick }) {
  if (!posts?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
        Based on these top posts
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {posts.map((p) => (
          <button
            key={p.ig_media_id}
            type="button"
            onClick={() => onClick?.(p.ig_media_id, p)}
            title={p.caption_preview || "Open diagnostic"}
            className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden group"
            style={{
              border: "1px solid rgba(15,23,42,0.08)",
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              cursor: "pointer",
            }}
            aria-label={`Open diagnostic for ${p.caption_preview?.slice(0, 60) || "post"}`}
          >
            <MediaThumb
              mediaId={p.ig_media_id}
              alt=""
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              fallback={
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.12))",
                  }}
                >
                  <ImageIcon size={14} className="text-violet-500" />
                </div>
              }
            />
            {typeof p.algorithm_score_pct === "number" && (
              <span
                className="absolute bottom-0.5 right-0.5 text-[9px] font-bold px-1 rounded-md"
                style={{
                  background: "rgba(15,23,42,0.78)",
                  color: "#f1f5f9",
                }}
              >
                {p.algorithm_score_pct}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ContentIdeasPanel({ onSourcePostClick }) {
  const [days, setDays] = useState(90);
  const [adjacentOnly, setAdjacentOnly] = useState(false);
  const { data, loading, error, refresh } = useContentIdeas({ days, limit: 5 });
  const { exhausted, resetsAt, used, limit } = useAIQuota();
  const renderedKeyRef = useRef(null);

  useEffect(() => {
    if (loading || !data) return;
    const key = `${days}:${data.ideas?.length ?? 0}`;
    if (renderedKeyRef.current === key) return;
    renderedKeyRef.current = key;
    trackAI("ideas", "rendered", {
      meta: { days, ideas_count: data.ideas?.length ?? 0 },
    });
  }, [data, loading, days]);

  const handleDaysChange = (next) => {
    if (next === days) return;
    trackAI("ideas", "days_changed", { meta: { from: days, to: next } });
    setDays(next);
  };

  const handleAdjacentToggle = (value) => {
    trackAI("ideas", "adjacent_toggled", { meta: { value } });
    setAdjacentOnly(value);
  };

  const handleRefresh = () => {
    trackAI("ideas", "refresh_clicked", {
      meta: { quota_remaining: limit - used },
    });
    if (exhausted) {
      trackAI("quota", "exhausted_seen", { meta: { feature: "ideas" } });
      return;
    }
    refresh();
  };

  const handleSourcePostClick = (igMediaId, sourcePost) => {
    trackAI("ideas", "source_post_opened", { refId: igMediaId });
    onSourcePostClick?.(igMediaId, sourcePost);
  };

  const filteredIdeas = useMemo(() => {
    if (!data?.ideas) return [];
    return adjacentOnly ? data.ideas.filter((i) => i.adjacent) : data.ideas;
  }, [data, adjacentOnly]);

  const hasIdeas = !loading && !error && filteredIdeas.length > 0;
  const noThemes =
    !loading && !error && data && data.themes_detected?.length === 0;
  const insufficientData =
    !loading && !error && data === null;
  const filterEmptied =
    !loading && data?.ideas?.length > 0 && filteredIdeas.length === 0;

  return (
    <motion.section
      aria-labelledby="ideas-title"
      aria-busy={loading || undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0 }}
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "var(--shadow-soft)",
        padding: "1.25rem 1.5rem",
      }}
    >
      <header className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 id="ideas-title" className="text-base font-semibold text-slate-900">
            Content Ideas
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Mined from your top-performing posts in the last {days} days.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="inline-flex rounded-lg overflow-hidden text-[11px] font-medium"
            style={{ border: "1px solid rgba(15,23,42,0.08)" }}
            role="group"
            aria-label="Period selector"
          >
            {DAY_OPTIONS.map((d) => {
              const active = d === days;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDaysChange(d)}
                  aria-pressed={active}
                  className="px-2.5 py-1 transition-colors"
                  style={{
                    background: active ? "rgba(139,92,246,0.12)" : "transparent",
                    color: active ? "#7c3aed" : "#64748b",
                    borderRight: d === 180 ? "none" : "1px solid rgba(15,23,42,0.08)",
                  }}
                >
                  {d}d
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={adjacentOnly}
              onChange={(e) => handleAdjacentToggle(e.target.checked)}
              className="rounded"
              style={{ accentColor: "#7c3aed" }}
            />
            Show adjacent only
          </label>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || exhausted}
            title={
              exhausted
                ? `At quota · Resets ${resetsAt ? new Date(resetsAt).toLocaleDateString() : "soon"}`
                : "New ideas · 1 AI call"
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
            style={{
              background:
                exhausted || loading ? "rgba(15,23,42,0.04)" : "rgba(139,92,246,0.10)",
              color: exhausted || loading ? "#94a3b8" : "#7c3aed",
              border: `1px solid ${
                exhausted || loading ? "rgba(15,23,42,0.08)" : "rgba(139,92,246,0.20)"
              }`,
              cursor: exhausted || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCcw size={12} />
            )}
            {exhausted ? "At quota" : loading ? "Loading…" : "New ideas"}
          </button>
        </div>
      </header>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2 mb-3"
          style={{
            background: "rgba(244,63,94,0.06)",
            border: "1px solid rgba(244,63,94,0.18)",
            color: "#9f1239",
          }}
        >
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {!loading && data?.themes_detected?.length > 0 && (
        <div className="mb-4">
          <ThemeChips themes={data.themes_detected} />
        </div>
      )}

      {!loading && data?.source_posts?.length > 0 && (
        <div className="mb-5">
          <SourcePostsStrip posts={data.source_posts} onClick={handleSourcePostClick} />
        </div>
      )}

      {loading && <IdeasGridSkeleton />}

      {insufficientData && (
        <AIEmptyState
          icon={Lightbulb}
          title="Not enough history yet"
          body={`Not enough posts in the last ${days} days to mine ideas from. Connect more posting history or try a longer window.`}
        />
      )}

      {noThemes && (
        <AIEmptyState
          icon={Lightbulb}
          title="No clear themes"
          body="We couldn't extract clear themes from this period. Try a longer window."
        />
      )}

      {filterEmptied && (
        <AIEmptyState
          icon={Lightbulb}
          title="No adjacent ideas in this batch"
          body='Toggle "Show adjacent only" off to see the rest of your ideas.'
        />
      )}

      {hasIdeas && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIdeas.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} index={i} />
          ))}
        </div>
      )}
    </motion.section>
  );
}

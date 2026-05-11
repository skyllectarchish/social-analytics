import { motion, AnimatePresence } from "framer-motion";
import AnimatedCounter from "../landing/ui/AnimatedCounter";
import { useMediaInsights } from "../../hooks/useInsights";

const METRIC_ICONS = {
  likes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
  comments: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  shares: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  saved: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  ),
  reach: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  views: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const HIGHLIGHT_METRICS = ["likes", "comments", "shares", "saved", "reach"];
const ICON_COLORS = {
  likes: "text-rose-500",
  comments: "text-violet-500",
  shares: "text-sky-500",
  saved: "text-amber-500",
  reach: "text-teal-500",
};

function fmtSecs(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  return `${seconds.toFixed(1)}s`;
}

function InsightMiniCard({ name, value, icon, colorClass }) {
  return (
    <div className="glass rounded-xl p-3 flex flex-col gap-1 items-center min-w-[72px]">
      <span className={`${colorClass || "text-slate-500"}`}>{icon}</span>
      <span className="font-display text-base font-semibold text-[#0a0e27]">
        <AnimatedCounter value={Math.round(value)} />
      </span>
      <span className="text-[10px] text-slate-500 capitalize">{name}</span>
    </div>
  );
}

export default function PostInsightsDrawer({ media, onClose }) {
  const { data, loading } = useMediaInsights(media?.ig_media_id);

  const insightsMap = {};
  (data?.insights ?? []).forEach((item) => {
    insightsMap[item.metric_name] = item.value;
  });

  const isReel = media?.media_type === "VIDEO";
  const imgSrc = media?.thumbnail_url || media?.media_url;

  return (
    <AnimatePresence>
      {media && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(10,14,39,0.30)", backdropFilter: "blur(6px)" }}
            onClick={onClose}
          />

          <motion.div
            key="drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
            className="fixed bottom-0 left-0 right-0 z-50 glass-strong rounded-t-3xl overflow-y-auto"
            style={{ maxHeight: "82vh", boxShadow: "var(--shadow-premium)" }}
          >
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            <div className="px-5 pb-8 pt-2 space-y-5">
              {/* Header row */}
              <div className="flex items-start gap-4">
                {imgSrc && (
                  <img
                    src={imgSrc}
                    alt="Post"
                    className="w-16 h-16 rounded-xl object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {media.caption && (
                    <p className="text-sm text-slate-700 line-clamp-2 mb-1">{media.caption}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${
                        media.media_type === "VIDEO"
                          ? "bg-fuchsia-100 text-fuchsia-700"
                          : media.media_type === "CAROUSEL_ALBUM"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {media.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : media.media_type}
                    </span>
                    {media.timestamp && (
                      <span>{new Date(media.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    )}
                    {media.permalink && (
                      <a
                        href={media.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-500 hover:underline flex items-center gap-0.5"
                      >
                        View on Instagram ↗
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Metric mini-cards */}
              {loading ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {HIGHLIGHT_METRICS.map((m) => (
                    <div key={m} className="animate-pulse glass rounded-xl p-3 min-w-[72px] h-20 bg-slate-100" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {HIGHLIGHT_METRICS.map((name) =>
                    insightsMap[name] !== undefined ? (
                      <InsightMiniCard
                        key={name}
                        name={name}
                        value={insightsMap[name]}
                        icon={METRIC_ICONS[name]}
                        colorClass={ICON_COLORS[name]}
                      />
                    ) : null
                  )}
                </div>
              )}

              {/* Extended metrics */}
              {!loading && Object.keys(insightsMap).length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "views", label: "Total Views" },
                    { key: "total_interactions", label: "Total Interactions" },
                    { key: "profile_visits", label: "Profile Visits" },
                    { key: "reposts", label: "Reposts" },
                    ...(isReel
                      ? [
                          { key: "ig_reels_avg_watch_time", label: "Avg Watch Time", fmt: fmtSecs },
                          { key: "ig_reels_video_view_total_time", label: "Total View Time", fmt: (v) => fmtSecs(v) },
                        ]
                      : []),
                    { key: "replies", label: "Replies" },
                    { key: "navigation", label: "Navigation" },
                  ]
                    .filter((m) => insightsMap[m.key] !== undefined)
                    .map((m) => (
                      <div key={m.key} className="glass-subtle rounded-xl px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mb-1">
                          {m.label}
                        </p>
                        <p className="font-display text-xl font-semibold text-[#0a0e27]">
                          {m.fmt ? m.fmt(insightsMap[m.key]) : Math.round(insightsMap[m.key]).toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>
              )}

              {!loading && Object.keys(insightsMap).length === 0 && (
                <p className="text-sm text-center text-slate-400 py-4">
                  No insights stored yet — run a sync to populate.
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

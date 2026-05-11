import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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

function fmtSecs(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  return `${seconds.toFixed(1)}s`;
}

const ICON_COLOR_MAP = {
  likes: "#f43f5e",
  comments: "#8b5cf6",
  shares: "#06b6d4",
  saved: "#f59e0b",
  reach: "#10b981",
};

function InsightMiniCard({ name, value, icon, index = 0 }) {
  const color = ICON_COLOR_MAP[name] ?? "#64748b";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", duration: 0.42, bounce: 0, delay: index * 0.055 }}
      style={{
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: 72,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <span style={{ color: "#0F172A", fontSize: 16, fontWeight: 700 }}>
        <AnimatedCounter value={Math.round(value)} />
      </span>
      <span style={{ fontSize: 10, color: "#64748B", textTransform: "capitalize" }}>{name}</span>
    </motion.div>
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
            style={{ background: "rgba(15,23,42,0.25)", backdropFilter: "blur(6px)" }}
            onClick={onClose}
          />

          <motion.div
            key="drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-y-auto"
            style={{
              maxHeight: "82vh",
              background: "rgba(255,255,255,0.98)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderBottom: "none",
              boxShadow: "0 -16px 60px rgba(0,0,0,0.12), 0 -1px 0 rgba(0,0,0,0.06)",
            }}
          >
            {/* gradient top accent line */}
            <div style={{ height: 2, background: "linear-gradient(90deg, #7C3AED 0%, #EC4899 50%, #F97316 100%)", borderRadius: "3px 3px 0 0" }} />
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }} />
            </div>

            <div className="px-5 pb-8 pt-2 space-y-5">
              {/* Header row */}
              <div className="flex items-start gap-4">
                {imgSrc && (
                  <img
                    src={imgSrc}
                    alt="Post"
                    className="w-16 h-16 rounded-xl object-cover shrink-0"
                    style={{ border: "1px solid rgba(0,0,0,0.08)" }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  {media.caption && (
                    <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {media.caption}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11, color: "#475569" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        background: media.media_type === "VIDEO" ? "rgba(139,92,246,0.15)" : media.media_type === "CAROUSEL_ALBUM" ? "rgba(245,158,11,0.15)" : "rgba(6,182,212,0.15)",
                        color: media.media_type === "VIDEO" ? "#c4b5fd" : media.media_type === "CAROUSEL_ALBUM" ? "#fcd34d" : "#67e8f9",
                      }}
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
                        style={{ color: "#8b5cf6", textDecoration: "none" }}
                      >
                        View on Instagram ↗
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: "rgba(0,0,0,0.06)", color: "#64748B", border: "none", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {/* Metric mini-cards */}
              {loading ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {HIGHLIGHT_METRICS.map((m) => (
                    <div key={m} className="animate-pulse rounded-xl min-w-[72px] h-20" style={{ background: "rgba(0,0,0,0.05)" }} />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {HIGHLIGHT_METRICS.map((name, idx) =>
                    insightsMap[name] !== undefined ? (
                      <InsightMiniCard
                        key={name}
                        name={name}
                        value={insightsMap[name]}
                        icon={METRIC_ICONS[name]}
                        index={idx}
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
                      <div
                        key={m.key}
                        style={{
                          background: "rgba(0,0,0,0.03)",
                          border: "1px solid rgba(0,0,0,0.07)",
                          borderRadius: 12,
                          padding: "12px 14px",
                        }}
                      >
                        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94A3B8", marginBottom: 4 }}>
                          {m.label}
                        </p>
                        <p className="metric-value" style={{ fontSize: 20, color: "#F1F5F9" }}>
                          {m.fmt ? m.fmt(insightsMap[m.key]) : Math.round(insightsMap[m.key]).toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>
              )}

              {!loading && Object.keys(insightsMap).length === 0 && (
                <p style={{ fontSize: 13, textAlign: "center", color: "#94A3B8", padding: "16px 0" }}>
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

import { useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import AnimatedCounter from "../landing/ui/AnimatedCounter";
import { UserPlus, Sparkles } from "lucide-react";
import { useMediaInsights, useMediaConversion } from "../../hooks/useInsights";
import { useMediaSentiment } from "../../hooks/useSentiment";
import { flagOn } from "../../utils/featureFlags";

const SENTIMENT_COLORS = {
  positive: "#10b981",
  neutral: "#94a3b8",
  negative: "#f43f5e",
};

const SENTIMENT_LABELS = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

function ConversionSection({ mediaId }) {
  const { data, loading } = useMediaConversion(mediaId);
  // Hide on load and when the post isn't eligible (404 → data:null). We
  // never show a skeleton because conversion data is best-effort — better to
  // render nothing than to imply a slot exists when it doesn't.
  if (loading || !data) return null;
  const attributed = data.attributed_follows ?? 0;
  const conversion = data.conversion_rate_pct ?? 0;
  const nfr = data.non_follower_reach ?? 0;
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <UserPlus size={12} className="text-violet-500" />
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7C3AED", fontWeight: 600 }}>
          Follower conversion
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
            ~{attributed >= 10 ? Math.round(attributed) : attributed.toFixed(1)}
          </p>
          <p style={{ fontSize: 10, color: "#94A3B8" }}>new follows</p>
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
            {conversion.toFixed(2)}%
          </p>
          <p style={{ fontSize: 10, color: "#94A3B8" }}>per non-follower</p>
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
            {nfr >= 1000 ? `${(nfr / 1000).toFixed(1)}K` : Math.round(nfr).toString()}
          </p>
          <p style={{ fontSize: 10, color: "#94A3B8" }}>reach off-followers</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
        Rough estimate. Attribution splits the day&apos;s follower gain across
        same-day and prior-day posts in proportion to non-follower reach —
        not a causal claim.
      </p>
    </div>
  );
}


function SentimentSection({ mediaId }) {
  const { data, loading } = useMediaSentiment(mediaId);
  if (loading) {
    return (
      <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.03)" }}>
        <div className="h-3 w-32 rounded mb-3" style={{ background: "rgba(0,0,0,0.06)" }} />
        <div className="grid grid-cols-3 gap-2 mb-3">
          {["positive", "neutral", "negative"].map((s) => (
            <div key={s} className="h-12 rounded-lg" style={{ background: "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const dist = data.distribution ?? {};
  const total = (dist.positive ?? 0) + (dist.neutral ?? 0) + (dist.negative ?? 0);
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94A3B8" }}>
        Audience reaction
      </p>
      <div className="grid grid-cols-3 gap-2">
        {["positive", "neutral", "negative"].map((s) => {
          const v = dist[s] ?? 0;
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return (
            <div
              key={s}
              className="rounded-lg p-2.5 text-center"
              style={{ background: `${SENTIMENT_COLORS[s]}10`, border: `1px solid ${SENTIMENT_COLORS[s]}25` }}
            >
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94A3B8" }}>
                {SENTIMENT_LABELS[s]}
              </p>
              <p className="font-mono font-semibold mt-1" style={{ color: SENTIMENT_COLORS[s], fontSize: 16 }}>
                {pct}%
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{v}</p>
            </div>
          );
        })}
      </div>
      {(data.samples ?? []).length > 0 && (
        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
          {data.samples.map((c) => (
            <div
              key={c.ig_comment_id}
              className="text-[11px] flex items-start gap-2 p-1.5 rounded"
              style={{ background: "rgba(0,0,0,0.02)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ background: SENTIMENT_COLORS[c.sentiment] ?? "#94a3b8" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-slate-700 italic leading-snug">
                  "{(c.text ?? "").slice(0, 140)}
                  {(c.text ?? "").length > 140 ? "…" : ""}"
                </p>
                {c.username && (
                  <p className="text-[10px] text-slate-400 mt-0.5">— @{c.username}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

export default function PostInsightsDrawer({ media, onClose, onDiagnose }) {
  const { data, loading } = useMediaInsights(media?.ig_media_id);

  const insightsMap = useMemo(() => {
    const map = {};
    for (const item of data?.insights ?? []) {
      map[item.metric_name] = item.value;
    }
    return map;
  }, [data]);

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
            role="dialog"
            aria-modal="true"
            aria-label="Post insights"
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
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      // Instagram CDN URLs expire after ~24h. Swap the broken
                      // image out for a neutral placeholder rather than show a
                      // browser's broken-image glyph.
                      e.currentTarget.style.display = "none";
                    }}
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
                {onDiagnose && flagOn("ai_diagnostic") && (
                  <button
                    onClick={() => onDiagnose(media)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-medium transition-colors"
                    style={{
                      background: "rgba(139,92,246,0.10)",
                      color: "#7c3aed",
                      border: "1px solid rgba(139,92,246,0.20)",
                      cursor: "pointer",
                    }}
                    aria-label="Diagnose this post"
                    title="Run AI diagnostic"
                  >
                    <Sparkles size={12} />
                    Diagnose
                  </button>
                )}
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
                        <p className="metric-value" style={{ fontSize: 20, color: "#0F172A" }}>
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

              <ConversionSection mediaId={media?.ig_media_id} />

              <SentimentSection mediaId={media?.ig_media_id} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

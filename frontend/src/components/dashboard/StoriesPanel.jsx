import { motion, AnimatePresence } from "framer-motion";
import { useStories } from "../../hooks/useInsights";

function fmtNum(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function StoryCard({ story }) {
  const imgSrc = story.media_type === "VIDEO" ? story.thumbnail_url : story.media_url;
  const views = story.insights?.find((i) => i.metric_name === "views")?.value ?? 0;
  const reach = story.insights?.find((i) => i.metric_name === "reach")?.value ?? 0;
  const displayCount = views || reach;

  return (
    <a
      href={story.permalink || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 group flex flex-col items-center gap-2.5"
      style={{ textDecoration: "none", cursor: "pointer" }}
    >
      {/* Story ring with glow */}
      <div
        style={{
          borderRadius: "50%",
          padding: 2.5,
          background: "linear-gradient(135deg, #F09433 0%, #E6683C 25%, #DC2743 50%, #CC2366 75%, #BC1888 100%)",
          boxShadow: "0 0 20px rgba(220,39,67,0.35), 0 0 40px rgba(188,24,136,0.15)",
          transition: "box-shadow 0.25s ease, transform 0.25s ease",
          flexShrink: 0,
        }}
        className="group-hover:scale-105"
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid #FFFFFF",
            background: "#111118",
          }}
        >
          {imgSrc ? (
            <img src={imgSrc} alt="Story" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #7C3AED, #EC4899)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
                <rect x="2" y="2" width="20" height="20" rx="5" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Live badge + metrics */}
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 3 }}>
          <span
            className="live-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#10B981",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 9, fontWeight: 800, color: "#059669", letterSpacing: "0.10em" }}>LIVE</span>
        </div>
        <p
          className="metric-value"
          style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.2 }}
        >
          {fmtNum(displayCount)}
        </p>
        <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>views</p>
      </div>
    </a>
  );
}

function SkeletonStory() {
  return (
    <div className="shrink-0 flex flex-col items-center gap-2.5 animate-pulse">
      <div style={{ width: 78, height: 78, borderRadius: "50%", background: "rgba(0,0,0,0.07)" }} />
      <div style={{ width: 40, height: 10, borderRadius: 4, background: "rgba(0,0,0,0.06)" }} />
      <div style={{ width: 28, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
    </div>
  );
}

export default function StoriesPanel() {
  const { data, loading, error } = useStories();
  const stories = data?.stories ?? [];

  return (
    <div className="rounded-2xl p-5 d-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8" }}>
          Active Stories
        </p>
        <AnimatePresence>
          {!loading && !error && (
            <motion.span
              initial={{ opacity: 0, scale: 0.75, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
              style={{
                borderRadius: 999,
                padding: "2px 10px",
                fontSize: 10,
                fontWeight: 700,
                background: stories.length > 0 ? "rgba(16,185,129,0.10)" : "rgba(0,0,0,0.05)",
                color: stories.length > 0 ? "#059669" : "#64748B",
                border: `1px solid ${stories.length > 0 ? "rgba(16,185,129,0.18)" : "rgba(0,0,0,0.08)"}`,
                display: "inline-block",
              }}
            >
              {stories.length} live
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div style={{ display: "flex", gap: 24, overflowX: "auto", paddingBottom: 4 }}>
          {[1, 2, 3, 4].map((i) => <SkeletonStory key={i} />)}
        </div>
      ) : error ? (
        <p style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "16px 0" }}>
          Failed to load stories.
        </p>
      ) : stories.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 8, color: "#94A3B8" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.5}>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
          </svg>
          <p style={{ fontSize: 13 }}>No stories live right now.</p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 24,
            overflowX: "auto",
            paddingBottom: 4,
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {stories.map((s, i) => (
            <motion.div
              key={s.ig_media_id}
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ type: "spring", duration: 0.45, bounce: 0, delay: i * 0.06 }}
              style={{ scrollSnapAlign: "start" }}
            >
              <StoryCard story={s} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

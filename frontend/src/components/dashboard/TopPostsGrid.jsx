import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboard } from "../../hooks/useInsights";
import { usePeriodComparator } from "../../context/PeriodComparatorContext";

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TYPE_STYLES = {
  VIDEO: { bg: "rgba(124,58,237,0.85)", color: "#fff" },
  IMAGE: { bg: "rgba(6,182,212,0.85)", color: "#fff" },
  CAROUSEL_ALBUM: { bg: "rgba(249,115,22,0.85)", color: "#fff" },
};

const RANK_GRADIENT = [
  "linear-gradient(135deg, #7C3AED, #EC4899)",
  "linear-gradient(135deg, #EC4899, #F97316)",
  "linear-gradient(135deg, #06B6D4, #7C3AED)",
];

function PostCard({ post, rank, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const imgSrc = post.thumbnail_url || post.media_url;
  const typeStyle = TYPE_STYLES[post.media_type] ?? { bg: "rgba(100,116,139,0.85)", color: "#fff" };
  const typeLabel = post.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : post.media_type;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: (rank - 1) * 0.06, ease: [0.16, 1, 0.3, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => onSelect?.(post)}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#111118",
      }}
      whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
    >
      {/* Thumbnail or placeholder */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={post.caption || "Post"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 50%, #F97316 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          <p
            style={{
              color: "rgba(255,255,255,0.85)",
              fontSize: 11,
              lineHeight: 1.4,
              textAlign: "center",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
            }}
          >
            {post.caption || "No caption"}
          </p>
        </div>
      )}

      {/* Bottom gradient overlay with metrics */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "55%",
          background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "8px 8px 8px",
          gap: 3,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Views */}
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            {fmtNum(post.views)}
          </span>
          {/* Interactions */}
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#EC4899", fontSize: 11, fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            {fmtNum(post.interactions)}
          </span>
        </div>
      </div>

      {/* Rank badge */}
      <div
        style={{
          position: "absolute",
          top: 7,
          left: 7,
          width: 24,
          height: 24,
          borderRadius: 8,
          background: rank <= 3 ? RANK_GRADIENT[rank - 1] : "rgba(15,23,42,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 800,
          color: "#fff",
          backdropFilter: "blur(4px)",
          border: rank <= 3 ? "none" : "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {rank}
      </div>

      {/* Type badge */}
      <div
        style={{
          position: "absolute",
          top: 7,
          right: 7,
          padding: "2px 6px",
          borderRadius: 6,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.06em",
          background: typeStyle.bg,
          color: typeStyle.color,
          backdropFilter: "blur(4px)",
        }}
      >
        {typeLabel}
      </div>

      {/* Hover overlay */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(9,9,15,0.82)",
              backdropFilter: "blur(2px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 12,
            }}
          >
            {post.caption && (
              <p
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 11,
                  lineHeight: 1.4,
                  textAlign: "center",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  marginBottom: 4,
                }}
              >
                {post.caption}
              </p>
            )}
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <p className="metric-value" style={{ color: "#7C3AED", fontSize: 16 }}>{fmtNum(post.views)}</p>
                <p style={{ color: "#475569", fontSize: 9, marginTop: 2 }}>VIEWS</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p className="metric-value" style={{ color: "#EC4899", fontSize: 16 }}>{fmtNum(post.interactions)}</p>
                <p style={{ color: "#475569", fontSize: 9, marginTop: 2 }}>ENGAGES</p>
              </div>
            </div>
            <p style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>Click to see full insights →</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="animate-pulse"
      style={{
        aspectRatio: "1 / 1",
        borderRadius: 12,
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    />
  );
}

export default function TopPostsGrid({ onSelect }) {
  const { data, loading, error } = useDashboard();
  const { days } = usePeriodComparator();
  const posts = data?.top_posts ?? [];

  return (
    <div
      className="rounded-2xl overflow-hidden d-card"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8" }}>
          Top Posts
        </p>
        <span
          style={{
            background: "rgba(124,58,237,0.15)",
            color: "#C4B5FD",
            border: "1px solid rgba(124,58,237,0.25)",
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          Last {days}d
        </span>
      </div>

      {/* Grid */}
      <div style={{ padding: 16, flex: 1 }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error || posts.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#94A3B8", fontSize: 13, textAlign: "center" }}>
            {error || "No top posts yet — run a sync first."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {posts.map((post, i) => (
              <PostCard
                key={post.ig_media_id}
                post={post}
                rank={i + 1}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

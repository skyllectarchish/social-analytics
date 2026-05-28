import { motion } from "framer-motion";
import { useDashboard } from "../../hooks/useInsights";

const TYPE_COLORS = {
  VIDEO: { bg: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "rgba(139,92,246,0.25)" },
  IMAGE: { bg: "rgba(6,182,212,0.15)", color: "#67e8f9", border: "rgba(6,182,212,0.25)" },
  CAROUSEL_ALBUM: { bg: "rgba(245,158,11,0.15)", color: "#fcd34d", border: "rgba(245,158,11,0.25)" },
};

function fmtNum(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function SkeletonRow() {
  return (
    <div
      className="animate-pulse flex items-center gap-4 px-5 py-3"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="w-6 h-4 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-48 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
      <div className="w-14 h-3 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="w-14 h-3 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

export default function TopPostsTable({ onSelect }) {
  // useDashboard reads `days`/`compareTo` from PeriodComparatorContext; no arg needed.
  const { data, loading, error } = useDashboard();

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#475569" }}>
          Top Posts
        </p>
        <span
          style={{
            background: "rgba(139,92,246,0.15)",
            color: "#c4b5fd",
            border: "1px solid rgba(139,92,246,0.25)",
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          Last {days}d
        </span>
      </div>

      {/* Column headers */}
      {!loading && (data?.top_posts?.length ?? 0) > 0 && (
        <div
          className="flex items-center gap-4 px-5 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
        >
          <span style={{ width: 24, fontSize: 10, color: "#334155" }}>#</span>
          <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type</span>
          <span style={{ flex: 1, fontSize: 10, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase" }}>Caption</span>
          <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 56, textAlign: "right" }}>Views</span>
          <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 72, textAlign: "right" }}>Interactions</span>
          <span style={{ width: 20 }} />
        </div>
      )}

      {loading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error || !data?.top_posts?.length ? (
        <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "#334155" }}>
          {error || "No top posts yet — run a sync first."}
        </div>
      ) : (
        <div>
          {data.top_posts.map((post, i) => {
            const typeStyle = TYPE_COLORS[post.media_type] ?? {
              bg: "rgba(255,255,255,0.08)",
              color: "#94a3b8",
              border: "rgba(255,255,255,0.12)",
            };

            return (
              <motion.div
                key={post.ig_media_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 + i * 0.05, duration: 0.35 }}
                onClick={() => onSelect?.(post)}
                className="flex items-center gap-4 px-5 py-2 cursor-pointer transition-all"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  style={{
                    width: 24,
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: i < 3 ? "#8b5cf6" : "#334155",
                    fontFamily: "system-ui",
                  }}
                >
                  {i + 1}
                </span>

                <span
                  style={{
                    flexShrink: 0,
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    background: typeStyle.bg,
                    color: typeStyle.color,
                    border: `1px solid ${typeStyle.border}`,
                  }}
                >
                  {post.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : post.media_type}
                </span>

                <p
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: "#94a3b8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {post.caption || <span style={{ color: "#334155", fontStyle: "italic" }}>No caption</span>}
                </p>

                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: "#64748b",
                    minWidth: 56,
                    justifyContent: "flex-end",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {fmtNum(post.views)}
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: "#ec4899",
                    minWidth: 72,
                    justifyContent: "flex-end",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                  {fmtNum(post.interactions)}
                </div>

                {post.permalink && (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ flexShrink: 0, color: "#334155", transition: "color 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#8b5cf6"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#334155"; }}
                    title="View on Instagram"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { motion } from "framer-motion";
import { useDashboard } from "../../hooks/useInsights";

const TYPE_BADGE = {
  VIDEO: "bg-fuchsia-100 text-fuchsia-700",
  IMAGE: "bg-sky-100 text-sky-700",
  CAROUSEL_ALBUM: "bg-orange-100 text-orange-700",
};

function fmtNum(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center gap-4 p-4">
      <div className="w-6 h-6 rounded bg-slate-200" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-48 bg-slate-200 rounded" />
        <div className="h-3 w-24 bg-slate-100 rounded" />
      </div>
      <div className="w-16 h-3 bg-slate-200 rounded" />
      <div className="w-16 h-3 bg-slate-200 rounded" />
    </div>
  );
}

export default function TopPostsTable({ days, onSelect }) {
  const { data, loading, error } = useDashboard(days);

  return (
    <div className="glass rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Top Posts
        </p>
        <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">
          Last {days} days
        </span>
      </div>

      {loading ? (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error || !data?.top_posts?.length ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {error || "No top posts yet — run a sync first."}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {data.top_posts.map((post, i) => (
            <motion.div
              key={post.ig_media_id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
              onClick={() => onSelect?.(post)}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="w-6 text-center font-display text-base font-semibold text-slate-300">
                {i + 1}
              </span>

              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  TYPE_BADGE[post.media_type] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {post.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : post.media_type}
              </span>

              <p className="flex-1 text-sm text-slate-700 truncate min-w-0">
                {post.caption || <span className="text-slate-400 italic">No caption</span>}
              </p>

              <div className="shrink-0 flex items-center gap-1 text-xs text-slate-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {fmtNum(post.views)}
              </div>

              <div className="shrink-0 flex items-center gap-1 text-xs text-pink-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
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
                  className="shrink-0 text-slate-300 hover:text-violet-500 transition-colors"
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
          ))}
        </div>
      )}
    </div>
  );
}

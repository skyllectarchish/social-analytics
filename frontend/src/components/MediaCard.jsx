import MediaThumb from "./shared/MediaThumb";

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function MediaCard({ media, onInsightsClick }) {
  const likes = Number(media.like_count) || 0;
  const comments = Number(media.comments_count) || 0;

  return (
    <div
      className="group block glass rounded-2xl overflow-hidden metric-card cursor-pointer"
      style={{ boxShadow: "var(--shadow-soft)" }}
      onClick={() => onInsightsClick?.(media)}
    >
      <div className="relative aspect-square overflow-hidden">
        <MediaThumb
          mediaId={media.ig_media_id}
          alt={media.caption?.slice(0, 60) || "Post"}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <span className="text-4xl text-slate-400">
                {media.media_type === "VIDEO" ? "▶" : "🖼"}
              </span>
            </div>
          }
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: "linear-gradient(to top, rgba(10,14,39,0.7) 0%, rgba(10,14,39,0.3) 60%, transparent 100%)" }}
        >
          <div className="flex items-center gap-4 text-white text-sm font-semibold mt-auto mb-3">
            <span className="flex items-center gap-1.5">
              <EyeIcon /> {fmtNum(likes + comments)}
            </span>
            <span className="flex items-center gap-1.5">
              <HeartIcon /> {fmtNum(likes)}
            </span>
          </div>
        </div>

        {media.media_type === "VIDEO" && (
          <div className="absolute top-2 right-2 rounded-md px-2 py-0.5 text-xs font-semibold bg-fuchsia-100 text-fuchsia-700">
            VIDEO
          </div>
        )}
        {media.media_type === "CAROUSEL_ALBUM" && (
          <div className="absolute top-2 right-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
        )}
      </div>

      <div className="p-4">
        {media.caption && (
          <p className="text-sm mb-3 line-clamp-2 leading-relaxed text-slate-600">
            {media.caption}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-rose-500">
            <HeartIcon /> {likes.toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 text-violet-500">
            <CommentIcon /> {comments.toLocaleString()}
          </span>
          {media.timestamp && (
            <span className="ml-auto text-slate-400">
              {new Date(media.timestamp).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

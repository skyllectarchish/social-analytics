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

export default function MediaCard({ media }) {
  const imgSrc = media.media_type === "VIDEO" ? media.thumbnail_url : media.media_url;

  return (
    <a
      href={media.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-2xl overflow-hidden"
      style={{
        background: "oklch(0.18 0.02 275)",
        border: "1px solid oklch(0.30 0.04 275)",
        boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 12px 40px oklch(0.65 0.25 275 / 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 24px oklch(0 0 0 / 0.4)";
      }}
    >
      <div className="relative aspect-square overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt={media.caption?.slice(0, 60) || "Post"} className="w-full h-full object-cover"
            style={{ transition: "transform 0.3s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: "oklch(0.22 0.03 275)" }}>
            <span style={{ color: "oklch(0.50 0.02 275)", fontSize: 40 }}>
              {media.media_type === "VIDEO" ? "▶" : "🖼"}
            </span>
          </div>
        )}
        {media.media_type === "VIDEO" && (
          <div className="absolute top-2 right-2 rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ background: "oklch(0 0 0 / 0.7)", color: "white" }}>
            VIDEO
          </div>
        )}
        {media.media_type === "CAROUSEL_ALBUM" && (
          <div className="absolute top-2 right-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ filter: "drop-shadow(0 1px 2px black)" }}>
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
        )}
      </div>

      <div className="p-4">
        {media.caption && (
          <p className="text-sm mb-3 line-clamp-2 leading-relaxed" style={{ color: "oklch(0.75 0.02 275)" }}>
            {media.caption}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs" style={{ color: "oklch(0.60 0.02 275)" }}>
          <span className="flex items-center gap-1.5" style={{ color: "oklch(0.65 0.25 25)" }}>
            <HeartIcon /> {media.like_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5" style={{ color: "oklch(0.65 0.25 275)" }}>
            <CommentIcon /> {media.comments_count.toLocaleString()}
          </span>
          <span className="ml-auto" style={{ color: "oklch(0.50 0.02 275)" }}>
            {new Date(media.timestamp).toLocaleDateString()}
          </span>
        </div>
      </div>
    </a>
  );
}

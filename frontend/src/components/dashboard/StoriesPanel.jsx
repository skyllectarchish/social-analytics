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

  return (
    <a
      href={story.permalink || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 group flex flex-col items-center gap-2 cursor-pointer"
    >
      {/* Instagram-style gradient ring */}
      <div
        className="w-20 h-20 rounded-full p-0.5 transition-transform group-hover:scale-105"
        style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}
      >
        <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 border-2 border-white">
          {imgSrc ? (
            <img src={imgSrc} alt="Story" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="2" width="20" height="20" rx="5" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Live indicator + metrics */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          <span className="text-[10px] font-semibold text-emerald-600">LIVE</span>
        </div>
        <p className="text-xs font-semibold text-[#0a0e27]">{fmtNum(views || reach)}</p>
        <p className="text-[10px] text-slate-400">views</p>
      </div>
    </a>
  );
}

function SkeletonStory() {
  return (
    <div className="shrink-0 flex flex-col items-center gap-2 animate-pulse">
      <div className="w-20 h-20 rounded-full bg-slate-200" />
      <div className="w-12 h-3 rounded bg-slate-200" />
      <div className="w-8 h-2 rounded bg-slate-100" />
    </div>
  );
}

export default function StoriesPanel() {
  const { data, loading, error } = useStories();
  const stories = data?.stories ?? [];

  return (
    <div className="glass rounded-2xl p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Active Stories
        </p>
        {!loading && !error && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              stories.length > 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {stories.length} live
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex gap-5 overflow-x-auto pb-1">
          {[1, 2, 3].map((i) => <SkeletonStory key={i} />)}
        </div>
      ) : error ? (
        <p className="text-sm text-slate-400 text-center py-4">Failed to load stories.</p>
      ) : stories.length === 0 ? (
        <div className="flex flex-col items-center py-6 gap-2 text-slate-400">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
          </svg>
          <p className="text-sm">No stories live right now.</p>
        </div>
      ) : (
        <div
          className="flex gap-5 overflow-x-auto pb-1"
          style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
        >
          {stories.map((s) => (
            <div key={s.ig_media_id} style={{ scrollSnapAlign: "start" }}>
              <StoryCard story={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

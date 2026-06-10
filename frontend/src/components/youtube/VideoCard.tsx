import type { YoutubeVideo } from "../../api/youtubeTypes";

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function VideoCard({
  video,
  active,
  onClick,
}: {
  video: YoutubeVideo;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full overflow-hidden rounded-2xl text-left ring-1 transition ${
        active
          ? "bg-lavender/60 ring-2 ring-violet/30"
          : "ring-black/5 hover:ring-violet/40"
      }`}
      aria-pressed={active}
    >
      <div className="relative aspect-video overflow-hidden bg-lavender">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-lavender" />
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
          {fmtDuration(video.duration_seconds)}
        </span>
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white capitalize">
          {video.video_format.replace("_", " ")}
        </span>
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-medium leading-snug">{video.title}</p>
        <div className="mt-1 flex gap-2">
          <span className="chip !px-1.5 !py-0.5 !text-[10px]"><span className="num">{fmt(video.view_count)}</span> views</span>
          <span className="chip !px-1.5 !py-0.5 !text-[10px]"><span className="num">{fmt(video.like_count)}</span> likes</span>
        </div>
      </div>
    </button>
  );
}

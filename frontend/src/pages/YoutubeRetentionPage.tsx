import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import api, { safeGet } from "../api/client";
import type { RetentionResponse, YoutubeVideo, YoutubeVideoListResponse } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import VideoCard from "../components/youtube/VideoCard";
import SmartRetentionChart from "../components/youtube/SmartRetentionChart";
import { ChartSkeleton } from "../components/dashboard/Skeletons";

export default function YoutubeRetentionPage() {
  const [syncing, setSyncing] = useState(false);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<YoutubeVideo | null>(null);
  const [retention, setRetention] = useState<RetentionResponse | null>(null);
  const [loadingRetention, setLoadingRetention] = useState(false);

  useEffect(() => {
    safeGet<YoutubeVideoListResponse>("/youtube/videos", { page: 1, page_size: 50 }).then((r) => {
      setVideos(r?.items ?? []);
    });
  }, []);

  const selectVideo = useCallback(async (video: YoutubeVideo) => {
    setSelected(video);
    setRetention(null);
    setLoadingRetention(true);
    try {
      const { data } = await api.get<RetentionResponse>(`/youtube/insights/retention/${video.video_id}`);
      setRetention(data);
    } catch {
      setRetention(null);
    } finally {
      setLoadingRetention(false);
    }
  }, []);

  async function sync() {
    setSyncing(true);
    try { await api.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

  const filtered = videos.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <YoutubeDashboardLayout active="Retention Studio" onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Retention{" "}
            <span className="font-serif font-normal italic text-foreground/60">studio.</span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            Pick a video to see where viewers drop off
          </p>
        </div>

        <div className="flex gap-4 min-h-[600px]">
        <div className="w-72 shrink-0 flex flex-col gap-2">
          <input
            type="search"
            placeholder="Search videos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="chip w-full bg-white/60 text-sm outline-none placeholder:text-foreground/40"
            aria-label="Search videos"
          />
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-foreground/40">
                {videos.length === 0 ? "No videos synced yet." : "No matches."}
              </p>
            )}
            {filtered.map((v, i) => (
              <motion.div
                key={v.video_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: i * 0.03, ease: "easeOut" }}
              >
                <VideoCard
                  video={v}
                  active={selected?.video_id === v.video_id}
                  onClick={() => selectVideo(v)}
                />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex-1 card-hairline p-5">
          {!selected && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-foreground/40">
              <svg className="h-12 w-12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.8 15.5V8.5l6.3 3.5-6.3 3.5Z" />
              </svg>
              <p className="text-sm">Select a video from the list to see its retention curve</p>
            </div>
          )}

          {selected && loadingRetention && <ChartSkeleton />}

          {selected && !loadingRetention && retention && (
            <div>
              <div>
                <h2 className="text-lg font-semibold leading-snug line-clamp-2">{selected.title}</h2>
                <p className="text-xs text-foreground/55">
                  {selected.video_format.replace("_", " ")} &middot; {Math.round(selected.duration_seconds / 60)} min
                </p>
              </div>
              <div className="mt-4">
                <SmartRetentionChart
                  curve={retention.curve}
                  annotations={retention.annotations}
                  annotationsPending={retention.annotations_pending}
                  durationSeconds={selected.duration_seconds}
                />
              </div>
            </div>
          )}

          {selected && !loadingRetention && !retention && (
            <div className="flex h-full items-center justify-center text-sm text-foreground/40">
              No retention data found for this video. It may have fewer than 1,000 views.
            </div>
          )}
        </div>
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}

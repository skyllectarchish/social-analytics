import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, TrendingUp, RefreshCw } from "lucide-react";
import apiClient from "../api/client";
import type {
  YoutubeCompetitor, CompetitorOutlier, TitleHistoryEntry,
} from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { CardEmpty } from "../components/dashboard/States";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function YoutubeCompetitorsPage() {
  const [competitors, setCompetitors] = useState<YoutubeCompetitor[]>([]);
  const [outliers, setOutliers] = useState<CompetitorOutlier[]>([]);
  const [recentVideos, setRecentVideos] = useState<CompetitorOutlier[]>([]);
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [titleHistory, setTitleHistory] = useState<TitleHistoryEntry[]>([]);

  async function sync() {
    setSyncing(true);
    try { await apiClient.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

  const fetchVideos = async () => {
    setFetchingVideos(true);
    try {
      await apiClient.post("/youtube/competitors/sync");
      await new Promise(r => setTimeout(r, 2000));
      await load();
    } finally {
      setFetchingVideos(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const [compRes, outlierRes, recentRes] = await Promise.all([
      apiClient.get<YoutubeCompetitor[]>("/youtube/competitors").catch(() => null),
      apiClient.get<CompetitorOutlier[]>("/youtube/insights/outliers").catch(() => null),
      apiClient.get<CompetitorOutlier[]>("/youtube/insights/recent-videos").catch(() => null),
    ]);
    setCompetitors(compRes?.data ?? []);
    setOutliers(outlierRes?.data ?? []);
    setRecentVideos(recentRes?.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCompetitor = async () => {
    if (!handle.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await apiClient.post("/youtube/competitors", { handle: handle.trim() });
      setHandle("");
      await load();
    } catch (e: any) {
      setAddError(e?.response?.data?.detail ?? "Failed to add competitor");
    } finally {
      setAdding(false);
    }
  };

  const removeCompetitor = async (id: string) => {
    await apiClient.delete(`/youtube/competitors/${id}`).catch(() => null);
    await load();
  };

  const toggleHistory = async (videoId: string) => {
    if (selectedVideoId === videoId) {
      setSelectedVideoId(null);
      return;
    }
    setSelectedVideoId(videoId);
    const res = await apiClient.get<TitleHistoryEntry[]>(`/youtube/insights/title-history/${videoId}`).catch(() => null);
    setTitleHistory(res?.data ?? []);
  };

  return (
    <YoutubeDashboardLayout active="Competitors" onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Competitors{" "}
            <span className="font-serif font-normal italic text-foreground/60">on watch.</span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">Track competitors. Get AI analysis when their videos go viral.</p>
        </div>

        <div className="card-hairline p-5">
          <h2 className="text-lg font-semibold">Add competitor channel</h2>
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet/40 focus:ring-2 focus:ring-violet/20"
              placeholder="@channelhandle or youtube.com/@handle"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCompetitor()}
            />
            <button
              onClick={addCompetitor}
              disabled={adding || !handle.trim()}
              className="flex items-center gap-1 rounded-xl bg-violet px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-deep disabled:opacity-50"
            >
              <Plus size={14} /> {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="mt-1 text-xs text-red-500">{addError}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Tracking <span className="num text-foreground/55">({competitors.length})</span></h2>
            <div className="mt-4 space-y-2">
              {competitors.length === 0 && !loading && (
                <CardEmpty label="No competitors tracked yet." />
              )}
              {competitors.map(c => (
                <div key={c.competitor_channel_id} className="flex items-center gap-2 rounded-xl p-2 transition-colors hover:bg-lavender/40">
                  {c.competitor_thumbnail_url && (
                    <img src={c.competitor_thumbnail_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.competitor_title}</p>
                    {c.webhook_active && <span className="text-[10px] font-medium text-emerald-600">● Live</span>}
                  </div>
                  <button onClick={() => removeCompetitor(c.competitor_channel_id)} className="text-foreground/30 transition-colors hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {outliers.length > 0 ? "Outlier videos" : "Recent competitor videos"}
              </h2>
              {competitors.length > 0 && (
                <button
                  onClick={fetchVideos}
                  disabled={fetchingVideos}
                  className="flex items-center gap-1 text-xs text-foreground/50 transition-colors hover:text-violet-deep disabled:opacity-40"
                  title="Fetch latest competitor videos now"
                >
                  <RefreshCw size={11} className={fetchingVideos ? "animate-spin" : ""} />
                  {fetchingVideos ? "Fetching…" : "Fetch Now"}
                </button>
              )}
            </div>
            {outliers.length === 0 && recentVideos.length === 0 && !loading && (
              <div className="card-hairline p-5">
                <CardEmpty label='No videos fetched yet. Click "Fetch Now" to load competitor videos.' />
              </div>
            )}
            {(outliers.length > 0 ? outliers : recentVideos).map(o => (
              <motion.div key={o.video_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-hairline p-5">
                <div className="flex gap-3">
                  {o.thumbnail_url && (
                    <img src={o.thumbnail_url} className="h-14 w-24 flex-shrink-0 rounded-lg object-cover" alt="" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium">{o.title}</p>
                      <span className="chip flex items-center gap-1 whitespace-nowrap !bg-lavender text-xs text-violet-deep">
                        <TrendingUp size={10} /> <span className="num">{fmtNum(o.view_count)}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-foreground/40">{formatDate(o.published_at)}</p>
                    {o.llm_analysis && (
                      <p className="mt-2 rounded-lg border border-violet/10 bg-violet/5 p-2 text-xs text-foreground/70">
                        {o.llm_analysis}
                      </p>
                    )}
                    <button onClick={() => toggleHistory(o.video_id)} className="mt-2 text-xs text-violet underline">
                      {selectedVideoId === o.video_id ? "Hide title history" : "Show title history"}
                    </button>
                    <AnimatePresence>
                      {selectedVideoId === o.video_id && titleHistory.length > 1 && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 overflow-hidden">
                          <div className="space-y-1">
                            {titleHistory.map((t, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="shrink-0 text-foreground/30">{formatDate(t.observed_at)}</span>
                                <span className={i === titleHistory.length - 1 ? "font-medium" : "text-foreground/40 line-through"}>{t.title_text}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}

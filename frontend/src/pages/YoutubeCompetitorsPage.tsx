import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import apiClient from "../api/client";
import type {
  YoutubeCompetitor, CompetitorOutlier, TitleHistoryEntry,
} from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";

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
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [titleHistory, setTitleHistory] = useState<TitleHistoryEntry[]>([]);

  async function sync() {
    setSyncing(true);
    try { await apiClient.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

  const load = async () => {
    setLoading(true);
    const [compRes, outlierRes] = await Promise.all([
      apiClient.get<YoutubeCompetitor[]>("/youtube/competitors").catch(() => null),
      apiClient.get<CompetitorOutlier[]>("/youtube/insights/outliers").catch(() => null),
    ]);
    setCompetitors(compRes?.data ?? []);
    setOutliers(outlierRes?.data ?? []);
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
    <YoutubeDashboardLayout active="Outlier Radar" onSync={sync} syncing={syncing}>
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Outlier Radar</h1>
        <p className="text-sm text-ink/50 mb-6">Track competitors. Get AI analysis when their videos go viral.</p>

        <div className="card-hairline glass rounded-2xl p-4 mb-6">
          <p className="text-sm font-medium text-ink mb-2">Add Competitor Channel</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/50 border border-white/30 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/30"
              placeholder="@channelhandle or youtube.com/@handle"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCompetitor()}
            />
            <button
              onClick={addCompetitor}
              disabled={adding || !handle.trim()}
              className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1 disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              <Plus size={14} /> {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-hairline glass rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider mb-3">
              Tracking ({competitors.length})
            </p>
            {competitors.length === 0 && !loading && (
              <p className="text-sm text-ink/40 text-center py-6">No competitors tracked yet.</p>
            )}
            {competitors.map(c => (
              <div key={c.competitor_channel_id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/40 transition-colors">
                {c.competitor_thumbnail_url && (
                  <img src={c.competitor_thumbnail_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.competitor_title}</p>
                  {c.webhook_active && <span className="text-[10px] text-green-600 font-medium">● Live</span>}
                </div>
                <button onClick={() => removeCompetitor(c.competitor_channel_id)} className="text-ink/30 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider">Outlier Videos</p>
            {outliers.length === 0 && !loading && (
              <div className="card-hairline glass rounded-2xl p-8 text-center text-ink/40 text-sm">
                No outliers detected yet. Add competitors and check back after the next sync.
              </div>
            )}
            {outliers.map(o => (
              <motion.div key={o.video_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-hairline glass rounded-2xl p-4">
                <div className="flex gap-3">
                  {o.thumbnail_url && (
                    <img src={o.thumbnail_url} className="w-24 h-14 rounded-lg object-cover flex-shrink-0" alt="" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2">{o.title}</p>
                      <span className="chip bg-red-100 text-red-700 text-xs whitespace-nowrap flex items-center gap-1">
                        <TrendingUp size={10} /> {fmtNum(o.view_count)}
                      </span>
                    </div>
                    <p className="text-xs text-ink/40 mt-1">{formatDate(o.published_at)}</p>
                    {o.llm_analysis && (
                      <p className="text-xs text-ink/70 mt-2 bg-violet/5 rounded-lg p-2 border border-violet/10">
                        {o.llm_analysis}
                      </p>
                    )}
                    <button onClick={() => toggleHistory(o.video_id)} className="text-xs text-violet underline mt-2">
                      {selectedVideoId === o.video_id ? "Hide title history" : "Show title history"}
                    </button>
                    <AnimatePresence>
                      {selectedVideoId === o.video_id && titleHistory.length > 1 && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
                          <div className="space-y-1">
                            {titleHistory.map((t, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-ink/30 shrink-0">{formatDate(t.observed_at)}</span>
                                <span className={i === titleHistory.length - 1 ? "font-medium" : "line-through text-ink/40"}>{t.title_text}</span>
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

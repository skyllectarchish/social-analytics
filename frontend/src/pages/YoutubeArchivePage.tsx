import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Clock } from "lucide-react";
import apiClient from "../api/client";
import type { ArchiveMinerStatus, YoutubeArchiveSuggestion } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  REMAKE: { label: "Remake", color: "text-violet bg-violet/10" },
  SHORT: { label: "Clip to Short", color: "text-red-600 bg-red-50" },
  UPDATE: { label: "Update", color: "text-amber-600 bg-amber-50" },
};

function SuggestionCard({ s }: { s: YoutubeArchiveSuggestion }) {
  const cfg = TYPE_CONFIG[s.suggestion_type] ?? TYPE_CONFIG.UPDATE;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-hairline glass rounded-2xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">{s.original_title}</p>
        <span className={`chip text-xs whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip bg-ink/5 text-ink/60 text-[10px]">#{s.trending_topic}</span>
        {s.wikipedia_spike_pct > 0 && (
          <span className="chip bg-green-50 text-green-700 text-[10px]">Wikipedia +{s.wikipedia_spike_pct.toFixed(0)}%</span>
        )}
        {s.autocomplete_matches.length > 0 && (
          <span className="chip bg-blue-50 text-blue-700 text-[10px]">YT search: "{s.autocomplete_matches[0]}"</span>
        )}
      </div>
      <p className="text-xs text-ink/60 bg-violet/5 rounded-lg p-2 border border-violet/10">
        {s.llm_recommendation}
      </p>
    </motion.div>
  );
}

export default function YoutubeArchivePage() {
  const [status, setStatus] = useState<ArchiveMinerStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await apiClient.get<ArchiveMinerStatus>("/youtube/insights/archive").catch(() => null);
    setStatus(res?.data ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      await apiClient.post("/youtube/insights/archive/refresh");
    } catch (e: any) {
      if (e?.response?.status !== 429) console.error(e);
    }
    await load();
    setScanning(false);
  };

  const lastScanText = status?.last_scan
    ? `Last scanned ${new Date(status.last_scan).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Never scanned";

  return (
    <YoutubeDashboardLayout active="Archive Miner">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-ink mb-1">Archive Miner</h1>
            <p className="text-sm text-ink/50 flex items-center gap-1">
              <Clock size={12} /> {lastScanText}
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50 hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Run Scan Now"}
          </button>
        </div>

        {loading && <p className="text-sm text-ink/40">Loading suggestions…</p>}

        {!loading && (status?.suggestions.length ?? 0) === 0 && (
          <div className="card-hairline glass rounded-2xl p-12 text-center text-ink/40 text-sm">
            No revival opportunities found yet.<br />
            Run a scan or check back after the weekly job runs.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {status?.suggestions.map(s => (
            <SuggestionCard key={s.video_id} s={s} />
          ))}
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}

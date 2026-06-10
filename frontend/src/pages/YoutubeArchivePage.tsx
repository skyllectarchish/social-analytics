import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Clock } from "lucide-react";
import apiClient from "../api/client";
import type { ArchiveMinerStatus, YoutubeArchiveSuggestion } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { CardEmpty } from "../components/dashboard/States";

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  REMAKE: { label: "Remake", color: "text-violet bg-violet/10" },
  SHORT: { label: "Clip to Short", color: "text-violet-deep bg-lavender/60" },
  UPDATE: { label: "Update", color: "text-amber-600 bg-amber-50" },
};

function SuggestionCard({ s }: { s: YoutubeArchiveSuggestion }) {
  const cfg = TYPE_CONFIG[s.suggestion_type] ?? TYPE_CONFIG.UPDATE;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-hairline p-5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">{s.original_title}</p>
        <span className={`chip text-xs whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip bg-ink/5 text-foreground/60 text-[10px]">#{s.trending_topic}</span>
        {s.wikipedia_spike_pct > 0 && (
          <span className="chip bg-green-50 text-green-700 text-[10px]">Wikipedia +{s.wikipedia_spike_pct.toFixed(0)}%</span>
        )}
        {s.autocomplete_matches.length > 0 && (
          <span className="chip bg-blue-50 text-blue-700 text-[10px]">YT search: "{s.autocomplete_matches[0]}"</span>
        )}
      </div>
      <p className="text-xs text-foreground/60 bg-violet/5 rounded-lg p-2 border border-violet/10">
        {s.llm_recommendation}
      </p>
    </motion.div>
  );
}

export default function YoutubeArchivePage() {
  const [status, setStatus] = useState<ArchiveMinerStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try { await apiClient.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

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
    // Poll until last_scan timestamp changes (job is async)
    const prevScan = status?.last_scan ?? null;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res = await apiClient.get<ArchiveMinerStatus>("/youtube/insights/archive").catch(() => null);
      const data = res?.data ?? null;
      setStatus(data);
      setLoading(false);
      if (data?.last_scan && data.last_scan !== prevScan) break;
    }
    setScanning(false);
  };

  const lastScanText = status?.last_scan
    ? `Last scanned ${new Date(status.last_scan).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Never scanned";

  return (
    <YoutubeDashboardLayout active="Archive Miner" onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Archive{" "}
              <span className="font-serif font-normal italic text-foreground/60">miner.</span>
            </h1>
            <p className="mt-1 text-sm text-foreground/55 flex items-center gap-1">
              <Clock size={12} /> {lastScanText}
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="bg-violet text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50 hover:bg-violet-deep transition-colors"
          >
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Run Scan Now"}
          </button>
        </div>

        {loading && <p className="text-sm text-foreground/50">Loading suggestions…</p>}

        {!loading && (status?.suggestions.length ?? 0) === 0 && (
          <CardEmpty label="No revival opportunities found yet — run a scan or check back after the weekly job runs." />
        )}

        {(status?.suggestions.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {status?.suggestions.map(s => (
              <SuggestionCard key={s.video_id} s={s} />
            ))}
          </div>
        )}
      </div>
    </YoutubeDashboardLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowUpRight,
  Clapperboard,
  Eye,
  Film,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Share2,
  Users,
} from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { StoryHistoryResponse, StoryHistoryItem } from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function StatChip({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="card-hairline flex items-center gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lavender text-violet-deep">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="num text-lg font-semibold leading-tight">{value}</div>
        <div className="text-xs text-foreground/55">{label}</div>
      </div>
    </div>
  );
}

export default function StoriesPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<StoryHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<StoryHistoryResponse>("/instagram/stories/history", {
        params: { days },
      });
      setData(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        const profile = await api.get("/instagram/profile").then(() => true).catch(() => false);
        if (!profile) {
          navigate("/connect", { replace: true });
          return;
        }
      }
      setError(errorMessage(err, "Could not load your story history"));
    } finally {
      setLoading(false);
    }
  }, [days, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      // The insights sync snapshots any currently-live stories too.
      await api.post("/instagram/insights/sync", null, { params: { lookback_days: days } });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  const stories = data?.stories ?? [];
  const totals = useMemo(() => {
    const n = stories.length || 1;
    const sum = (f: (s: StoryHistoryItem) => number) => stories.reduce((a, s) => a + f(s), 0);
    return {
      count: stories.length,
      avgReach: Math.round(sum((s) => s.reach) / n),
      avgViews: Math.round(sum((s) => s.views) / n),
      replies: sum((s) => s.replies),
      shares: sum((s) => s.shares),
    };
  }, [stories]);

  if (loading && !data) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ backgroundColor: "#F5F6FA" }}>
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  return (
    <DashboardLayout active="Stories" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="mx-auto max-w-4xl space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Stories{" "}
            <span className="font-serif font-normal italic text-foreground/60">
              — saved before they vanish.
            </span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            Instagram deletes story insights after 24 hours. InfluenceIQ snapshots every story
            automatically, so this history only grows.
          </p>
        </div>

        {/* aggregates */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatChip icon={Clapperboard} label={`Stories · ${data?.period_days ?? days}d`} value={fmt(totals.count)} />
          <StatChip icon={Users} label="Avg reach" value={fmt(totals.avgReach)} />
          <StatChip icon={MessageCircle} label="Replies" value={fmt(totals.replies)} />
          <StatChip icon={Share2} label="Shares" value={fmt(totals.shares)} />
        </div>

        {/* story list */}
        {stories.length === 0 ? (
          <div className="card-hairline p-5">
            <CardEmpty label="No stories captured yet. Post a story and it will be snapshotted automatically within a few hours (or press Sync while one is live)." />
          </div>
        ) : (
          <ul className="space-y-3">
            {stories.map((s) => {
              const Icon = s.media_type === "VIDEO" ? Film : ImageIcon;
              return (
                <li key={s.ig_media_id} className="card-hairline flex items-center gap-4 p-4">
                  <span className="bg-ig grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-semibold">{fmtDate(s.timestamp)}</span>
                      <span className="chip !px-2 !py-0.5 text-[10px]">{s.media_type || "STORY"}</span>
                      {s.permalink && (
                        <a
                          href={s.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-foreground/45 transition hover:text-violet"
                        >
                          Open <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/65">
                      <span><span className="num font-semibold text-foreground">{fmt(s.reach)}</span> reach</span>
                      <span><span className="num font-semibold text-foreground">{fmt(s.views)}</span> views</span>
                      <span><span className="num font-semibold text-foreground">{fmt(s.replies)}</span> replies</span>
                      <span><span className="num font-semibold text-foreground">{fmt(s.shares)}</span> shares</span>
                      <span><span className="num font-semibold text-foreground">{fmt(s.navigation)}</span> taps</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}

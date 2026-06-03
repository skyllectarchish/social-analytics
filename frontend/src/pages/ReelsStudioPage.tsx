import { useEffect, useState } from "react";
import { Eye, Play, Timer } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty, PageLoading } from "../components/dashboard/States";
import { useSync } from "../hooks/useSync";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { safeGet } from "../api/client";
import type { ReelsRetentionResponse } from "../api/types";

type Reel = { title: string; watch: string; views: string; igId: string };
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);
const grade = (p: number) => (p >= 85 ? "A" : p >= 75 ? "A−" : p >= 65 ? "B+" : p >= 55 ? "B" : p >= 45 ? "C+" : "C");
const EMPTY_KPIS = [
  { label: "Avg watch-rate", value: "—", delta: "" },
  { label: "Total plays", value: "—", delta: "" },
  { label: "Avg reach", value: "—", delta: "" },
  { label: "Hook strength", value: "—", delta: "" },
];

function ReelCard({ r }: { r: Reel }) {
  const src = useAuthedImage(r.igId);
  return (
    <div className="group overflow-hidden rounded-2xl ring-1 ring-black/5 transition hover:ring-violet/40">
      <div className="relative aspect-[9/16]">
        {src ? <img src={src} alt={r.title} className="h-full w-full object-cover" /> : <div className="bg-lavender h-full w-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0" />
        <div className="chip absolute left-2 top-2 !border-white/10 !bg-black/50 !px-2 !py-0.5 !text-[10px] !text-white"><Play className="h-2.5 w-2.5" /> Reel</div>
        <div className="absolute inset-x-3 bottom-3 space-y-2">
          <div className="line-clamp-1 text-sm font-medium text-white">{r.title}</div>
          <div className="flex flex-wrap gap-1 text-[10px] text-white">
            <span className="rounded-md bg-black/40 px-1.5 py-1 backdrop-blur"><Eye className="mb-0.5 inline h-2.5 w-2.5" /> <span className="num">{r.views}</span></span>
            <span className="rounded-md bg-violet/80 px-1.5 py-1 backdrop-blur"><Timer className="mb-0.5 inline h-2.5 w-2.5" /> <span className="num">{r.watch}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReelsStudioPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [reels, setReels] = useState<Reel[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      // Reels are sparse, so floor the window at 90d — short selections (7/30)
      // would otherwise return nothing even when the account has reels.
      const window = Math.max(days, 90);
      const res = await safeGet<ReelsRetentionResponse>("/instagram/insights/reels-retention", { days: window, limit: 9 });
      if (!alive) return;
      if (res?.reels.length) {
        const rs = res.reels;
        const avgWatch = rs.reduce((s, r) => s + r.hook_strength_pct, 0) / rs.length;
        const totalPlays = rs.reduce((s, r) => s + r.views, 0);
        const avgReach = rs.reduce((s, r) => s + r.reach, 0) / rs.length;
        setKpis([
          { label: "Avg watch-rate", value: `${avgWatch.toFixed(1)}%`, delta: `${rs.length} reels` },
          { label: "Total plays", value: fmt(totalPlays), delta: `last ${window}d` },
          { label: "Avg reach", value: fmt(avgReach), delta: "per reel" },
          { label: "Hook strength", value: grade(avgWatch), delta: "rolling" },
        ]);
        setReels(rs.map((r) => ({ title: r.caption_preview || "Reel", igId: r.ig_media_id, views: fmt(r.views), watch: `${r.hook_strength_pct.toFixed(1)}%` })));
      } else {
        setKpis(EMPTY_KPIS);
        setReels([]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days]);

  return (
    <DashboardLayout active="Reels Studio" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Reels Studio</h1>
            <p className="mt-1 text-sm text-foreground/55">Watch-rate, hooks and retention — the metrics Instagram actually cares about.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="card-hairline p-5">
                <div className="text-xs uppercase tracking-wider text-foreground/55">{k.label}</div>
                <div className="num mt-2 text-3xl font-semibold">{k.value}</div>
                <div className="mt-1 text-xs text-emerald-600">{k.delta || " "}</div>
              </div>
            ))}
          </div>

          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Reel performance</h2>
            <p className="text-xs text-foreground/55">Ranked by reach</p>
            {reels.length === 0 ? (
              <CardEmpty label="No Reels analyzed yet — hit Sync to pull retention data from Instagram." />
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reels.map((r) => <ReelCard key={r.igId} r={r} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

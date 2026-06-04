import { useCallback, useEffect, useState } from "react";
import { Eye, Clock, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { safeGet } from "../api/client";
import type { YoutubeOverviewResponse, YoutubeVideoListResponse, YoutubeVideo } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import GlassTooltip from "../components/charts/GlassTooltip";
import Sparkline from "../components/charts/Sparkline";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

export default function YoutubeDashboardPage() {
  const [days] = useState(30);
  const [syncing, setSyncing] = useState(false);
  const [overview, setOverview] = useState<YoutubeOverviewResponse | null>(null);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);

  const load = useCallback(async () => {
    const [ov, vl] = await Promise.all([
      safeGet<YoutubeOverviewResponse>("/youtube/insights/overview", { days }),
      safeGet<YoutubeVideoListResponse>("/youtube/videos", { page: 1, page_size: 5 }),
    ]);
    setOverview(ov);
    setVideos(vl?.items ?? []);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      await api.post("/youtube/insights/sync");
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const totalViews = overview?.views.data.reduce((s, p) => s + p.value, 0) ?? 0;
  const totalMinutes = overview?.watch_minutes.data.reduce((s, p) => s + p.value, 0) ?? 0;
  const totalSubs = (overview?.subscribers_gained.data.reduce((s, p) => s + p.value, 0) ?? 0)
    - (overview?.subscribers_lost.data.reduce((s, p) => s + p.value, 0) ?? 0);

  const viewsSpark = (overview?.views.data ?? []).map((p) => ({ v: p.value }));
  const watchSpark = (overview?.watch_minutes.data ?? []).map((p) => ({ v: p.value }));
  const subsSpark = (overview?.subscribers_gained.data ?? []).map((p, i) => ({
    v: p.value - (overview?.subscribers_lost.data[i]?.value ?? 0),
  }));

  const chartData = (overview?.views.data ?? []).map((p) => ({
    date: p.date.slice(5),
    views: p.value,
  }));

  const stats = [
    { label: "Total Views", value: fmt(totalViews), icon: Eye, spark: viewsSpark },
    { label: "Watch Hours", value: fmt(Math.round(totalMinutes / 60)), icon: Clock, spark: watchSpark },
    { label: "Net Subscribers", value: (totalSubs >= 0 ? "+" : "") + fmt(totalSubs), icon: TrendingUp, spark: subsSpark },
  ];

  return (
    <YoutubeDashboardLayout active="Overview" onSync={sync} syncing={syncing}>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">YouTube Overview</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card-hairline p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/55">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="num mt-2 text-2xl font-semibold">{s.value}</div>
            <div className="mt-2 h-10">
              <Sparkline data={s.spark} color="#dc2626" />
            </div>
          </div>
        ))}
      </div>

      <div className="card-hairline mb-6 p-4">
        <div className="mb-3 text-sm font-medium">Daily Views — last {days} days</div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
              <Tooltip content={<GlassTooltip />} />
              <Area type="monotone" dataKey="views" stroke="#dc2626" fill="rgba(220,38,38,0.12)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-foreground/40">
            No data yet — sync to pull analytics from YouTube.
          </div>
        )}
      </div>

      {videos.length > 0 && (
        <div className="card-hairline p-4">
          <div className="mb-3 text-sm font-medium">Recent Videos</div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {videos.map((v) => (
              <a key={v.video_id} href="/youtube/retention" className="group block rounded-xl overflow-hidden border border-black/5 bg-white/40 hover:bg-white/70 transition">
                <div className="relative aspect-video bg-lavender">
                  {v.thumbnail_url && (
                    <img src={v.thumbnail_url} alt={v.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-2 text-xs font-medium leading-snug">{v.title}</p>
                  <p className="mt-1 text-[10px] text-foreground/50">{fmt(v.view_count)} views</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </YoutubeDashboardLayout>
  );
}

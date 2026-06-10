import { useCallback, useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { safeGet } from "../api/client";
import type { YoutubeOverviewResponse, YoutubeVideoListResponse, YoutubeVideo } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import GlassTooltip from "../components/charts/GlassTooltip";
import Sparkline from "../components/charts/Sparkline";
import { PALETTE } from "../data/mock";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const trendPct = (arr: { v: number }[]) => {
  if (arr.length < 2) return 0;
  const first = arr[0].v || 1;
  return ((arr[arr.length - 1].v - first) / Math.abs(first)) * 100;
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
    { label: "Total Views", value: fmt(totalViews), spark: viewsSpark, trend: trendPct(viewsSpark), color: PALETTE.violet },
    { label: "Watch Hours", value: fmt(Math.round(totalMinutes / 60)), spark: watchSpark, trend: trendPct(watchSpark), color: PALETTE.blue },
    { label: "Net Subscribers", value: (totalSubs >= 0 ? "+" : "") + fmt(totalSubs), spark: subsSpark, trend: trendPct(subsSpark), color: PALETTE.pink },
  ];

  return (
    <YoutubeDashboardLayout active="Overview" onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        {/* greeting */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Your channel{" "}
            <span className="font-serif font-normal italic text-foreground/60">at a glance.</span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">{days}-day window</p>
        </div>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((k) => {
            const up = k.trend >= 0;
            return (
              <div key={k.label} className="card-hairline p-5">
                <div className="text-xs font-medium uppercase tracking-wider text-foreground/55">{k.label}</div>
                <div className="num mt-2 text-3xl font-semibold">{k.value}</div>
                <div className="mt-1">
                  <span className={`flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-rose-500"}`}>
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {up ? "+" : ""}{k.trend.toFixed(1)}% vs last period
                  </span>
                </div>
                <div className="mt-3 h-10">
                  <Sparkline data={k.spark} color={k.color} />
                </div>
              </div>
            );
          })}
        </div>

        {/* daily views */}
        <div className="card-hairline p-5">
          <div>
            <h2 className="text-lg font-semibold">Daily views</h2>
            <p className="text-xs text-foreground/55">Views per day over the last {days} days</p>
          </div>
          <div className="mt-4 h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
                  <defs>
                    <linearGradient id="ytViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                  <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => fmt(v as number)} />
                  <Tooltip cursor={{ stroke: PALETTE.violet, strokeWidth: 1 }} content={<GlassTooltip />} />
                  <Area type="monotone" dataKey="views" stroke={PALETTE.primary} strokeWidth={2.5} fill="url(#ytViewsFill)" dot={false} activeDot={{ r: 4, fill: PALETTE.primary, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-foreground/50">
                No data yet — hit Sync to pull analytics from YouTube.
              </div>
            )}
          </div>
        </div>

        {/* recent videos */}
        {videos.length > 0 && (
          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">
              Recent videos <span className="font-serif font-normal italic text-foreground/55">this channel</span>
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {videos.map((v) => (
                <a
                  key={v.video_id}
                  href="/youtube/retention"
                  className="group overflow-hidden rounded-2xl text-left ring-1 ring-black/5 transition hover:ring-violet/40"
                >
                  <div className="relative aspect-video overflow-hidden bg-lavender">
                    {v.thumbnail_url && (
                      <img src={v.thumbnail_url} alt={v.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs font-medium leading-snug">{v.title}</p>
                    <p className="mt-1 text-[10px] text-foreground/50"><span className="num">{fmt(v.view_count)}</span> views</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {!overview && videos.length === 0 && (
          <CardEmpty label="No YouTube data yet — hit Sync to pull analytics from your channel." />
        )}
      </div>
    </YoutubeDashboardLayout>
  );
}

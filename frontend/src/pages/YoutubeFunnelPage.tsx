import { useEffect, useState } from "react";
import { ComposedChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import apiClient from "../api/client";
import type { CrossPlatformResponse, CrossPlatformDay } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { PALETTE } from "../data/mock";

const DAYS_OPTIONS = [30, 90, 180] as const;

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const day = payload[0]?.payload as CrossPlatformDay;
  return (
    <div className="glass card-hairline rounded-xl p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{day.day}</p>
      <p className="text-emerald-600">+<span className="num">{day.subscribers_gained}</span> gained</p>
      <p className="text-red-500">−<span className="num">{day.subscribers_lost}</span> lost</p>
      <p className="text-foreground font-medium">Net: {day.net_subscribers >= 0 ? "+" : ""}<span className="num">{day.net_subscribers}</span></p>
      {day.has_instagram_reel && <p className="text-violet mt-1 font-medium">📸 Instagram Reel</p>}
    </div>
  );
};

export default function YoutubeFunnelPage() {
  const [days, setDays] = useState<typeof DAYS_OPTIONS[number]>(90);
  const [data, setData] = useState<CrossPlatformResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try { await apiClient.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

  useEffect(() => {
    setLoading(true);
    apiClient.get<CrossPlatformResponse>(`/youtube/insights/cross-platform?days=${days}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const chartData = data?.days.map(d => ({ ...d, label: d.day.slice(5) })) ?? [];

  return (
    <YoutubeDashboardLayout active="Cross-Platform" onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Cross-platform{" "}
              <span className="font-serif font-normal italic text-foreground/60">ROI.</span>
            </h1>
            <p className="mt-1 text-sm text-foreground/55">Does Instagram drive YouTube subscribers?</p>
          </div>
          <div className="flex gap-1.5">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`chip !px-3 !py-1 transition ${days === d ? "!bg-violet !text-white !border-violet" : ""}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {data?.correlation !== undefined && data.correlation !== null && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`chip text-sm font-semibold ${
              (data.correlation ?? 0) > 0.5 ? "text-green-700 bg-green-50" :
              (data.correlation ?? 0) > 0.2 ? "text-amber-700 bg-amber-50" : "text-foreground/50 bg-ink/5"
            }`}>
              Instagram → YouTube: <span className="num">{((data.correlation ?? 0) * 100).toFixed(0)}%</span> correlation
            </span>
            <span className="text-[10px] text-foreground/40">Pearson r — correlation, not causation</span>
          </div>
        )}

        {loading && <p className="py-12 text-center text-sm text-foreground/50">Loading…</p>}

        {!loading && chartData.length === 0 && (
          <CardEmpty label="No data yet — connect both Instagram and YouTube and sync." />
        )}

        {!loading && chartData.length > 0 && (
          <div className="card-hairline p-5">
            <div>
              <h2 className="text-lg font-semibold">Subscriber funnel</h2>
              <p className="text-xs text-foreground/55">Purple lines = Instagram Reel posts · Area = daily YouTube subscribers</p>
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
                  <defs>
                    <linearGradient id="ytSubsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                  <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => fmt(v as number)} />
                  <Tooltip content={<CustomTooltip />} />
                  {data?.reel_posts.map(r => (
                    <ReferenceLine key={r.ig_media_id} x={r.post_date.slice(5)} stroke={PALETTE.violet} strokeDasharray="3 3" strokeOpacity={0.5} />
                  ))}
                  <Area type="monotone" dataKey="net_subscribers" stroke={PALETTE.violet} strokeWidth={2.5} fill="url(#ytSubsFill)" dot={false} activeDot={{ r: 4, fill: PALETTE.violet, strokeWidth: 0 }} name="Net subscribers" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {data && data.reel_posts.length > 0 && (
          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Instagram Reels in period</h2>
            <div className="mt-4 space-y-2">
              {data.reel_posts.slice(0, 8).map(r => (
                <div key={r.ig_media_id} className="flex items-center gap-3 text-xs">
                  {r.thumbnail_url && <img src={r.thumbnail_url} className="w-10 h-10 rounded-lg object-cover" alt="" />}
                  <div>
                    <p className="text-foreground/50">{r.post_date}</p>
                    <p className="line-clamp-1 text-foreground/70">{r.caption?.slice(0, 80) || "No caption"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </YoutubeDashboardLayout>
  );
}

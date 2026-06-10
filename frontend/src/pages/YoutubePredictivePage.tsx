import { useEffect, useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import apiClient from "../api/client";
import type { YoutubeVideo, YoutubeVideoListResponse, VelocityPoint, YoutubePrediction } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import GlassTooltip from "../components/charts/GlassTooltip";
import { PALETTE } from "../data/mock";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function YoutubePredictivePage() {
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [selected, setSelected] = useState<YoutubeVideo | null>(null);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [prediction, setPrediction] = useState<YoutubePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try { await apiClient.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

  useEffect(() => {
    apiClient.get<YoutubeVideoListResponse>("/youtube/videos?page=1&page_size=30")
      .then(r => setVideos(r.data.items ?? []))
      .catch(() => setVideos([]));
  }, []);

  const selectVideo = async (v: YoutubeVideo) => {
    setSelected(v);
    setLoading(true);
    const [velRes, predRes] = await Promise.all([
      apiClient.get<VelocityPoint[]>(`/youtube/insights/velocity/${v.video_id}`).catch(() => null),
      apiClient.get<YoutubePrediction | null>(`/youtube/insights/predictions/${v.video_id}`).catch(() => null),
    ]);
    setVelocity(velRes?.data ?? []);
    setPrediction(predRes?.data ?? null);
    setLoading(false);
  };

  return (
    <YoutubeDashboardLayout active="Predictive Studio" onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Predictive Studio{" "}
            <span className="font-serif font-normal italic text-foreground/60">your next hit.</span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">4-hour velocity → 30-day view projection.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card-hairline max-h-[600px] space-y-2 overflow-y-auto p-5">
            {videos.map(v => (
              <button
                key={v.video_id}
                onClick={() => selectVideo(v)}
                className={`flex w-full gap-3 rounded-xl p-2 text-left transition-colors ${
                  selected?.video_id === v.video_id ? "bg-lavender/60 ring-1 ring-violet/30" : "hover:bg-lavender/40"
                }`}
              >
                <img src={v.thumbnail_url} className="h-10 w-16 flex-shrink-0 rounded-lg object-cover" alt="" />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-medium">{v.title}</p>
                  <p className="mt-0.5 text-[10px] text-foreground/40"><span className="num">{fmtNum(v.view_count)}</span> views</p>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-4 lg:col-span-2">
            {!selected && (
              <div className="card-hairline p-5">
                <CardEmpty label="Select a video to see velocity and projection." />
              </div>
            )}
            {selected && (
              <>
                <div className="card-hairline p-5">
                  <h2 className="text-lg font-semibold">View velocity</h2>
                  <div className="mt-4 h-72">
                    {velocity.length === 0 ? (
                      <CardEmpty label="No velocity data yet." />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={velocity} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
                          <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                          <XAxis dataKey="hours" tickFormatter={h => `${h}h`} tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                          <YAxis tickFormatter={(v) => fmtNum(v as number)} tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} />
                          <Tooltip content={<GlassTooltip />} />
                          <Bar dataKey="view_count" fill={PALETTE.violet} radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="card-hairline p-5">
                  <h2 className="text-lg font-semibold">30-day projection</h2>
                  {loading && <p className="mt-4 text-xs text-foreground/40">Loading…</p>}
                  {!loading && !prediction && (
                    <p className="mt-4 text-xs text-foreground/40">No prediction yet — velocity data needed first (requires 4+ hours of data).</p>
                  )}
                  {!loading && prediction && (
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-lavender/60 p-4">
                        <div className="text-xs font-medium uppercase tracking-wider text-foreground/55">Predicted Views</div>
                        <div className="num mt-2 text-3xl font-semibold text-violet-deep">{fmtNum(prediction.predicted_30d_views)}</div>
                        <p className="mt-1 text-[10px] text-foreground/40">range: <span className="num">{fmtNum(prediction.predicted_low)}</span> – <span className="num">{fmtNum(prediction.predicted_high)}</span></p>
                      </div>
                      <div className="rounded-xl bg-green-50 p-4">
                        <div className="text-xs font-medium uppercase tracking-wider text-foreground/55">Est. Revenue</div>
                        <div className="num mt-2 text-3xl font-semibold text-green-700">
                          ${prediction.revenue_low_usd.toFixed(0)} – ${prediction.revenue_high_usd.toFixed(0)}
                        </div>
                        <p className="mt-1 text-[10px] text-foreground/40">at $3 RPM default</p>
                      </div>
                      {prediction.model_r2 !== null && (
                        <p className="col-span-2 text-center text-[10px] text-foreground/40">
                          Model accuracy: <span className="num">{((prediction.model_r2 ?? 0) * 100).toFixed(0)}%</span> R²
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}

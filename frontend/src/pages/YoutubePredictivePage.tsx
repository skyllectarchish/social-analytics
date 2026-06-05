import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import apiClient from "../api/client";
import type { YoutubeVideo, YoutubeVideoListResponse, VelocityPoint, YoutubePrediction } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";

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
    <YoutubeDashboardLayout active="Predictive Studio">
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Predictive Studio</h1>
        <p className="text-sm text-ink/50 mb-6">4-hour velocity → 30-day view projection.</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-hairline glass rounded-2xl p-4 space-y-2 max-h-[600px] overflow-y-auto">
            {videos.map(v => (
              <button
                key={v.video_id}
                onClick={() => selectVideo(v)}
                className={`w-full flex gap-3 p-2 rounded-xl text-left transition-colors ${
                  selected?.video_id === v.video_id ? "bg-red-50 ring-1 ring-red-300" : "hover:bg-white/50"
                }`}
              >
                <img src={v.thumbnail_url} className="w-16 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                <div className="min-w-0">
                  <p className="text-xs font-medium line-clamp-2">{v.title}</p>
                  <p className="text-[10px] text-ink/40 mt-0.5">{fmtNum(v.view_count)} views</p>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {!selected && (
              <div className="card-hairline glass rounded-2xl p-12 text-center text-ink/40 text-sm">
                Select a video to see velocity and projection.
              </div>
            )}
            {selected && (
              <>
                <div className="card-hairline glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-ink mb-3">View Velocity</p>
                  {velocity.length === 0 ? (
                    <p className="text-xs text-ink/40 text-center py-6">No velocity data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={velocity}>
                        <XAxis dataKey="hours" tickFormatter={h => `${h}h`} tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11 }} width={50} />
                        <Tooltip formatter={(v: number) => [fmtNum(v), "Views"]} labelFormatter={h => `${h}h after publish`} />
                        <Bar dataKey="view_count" fill="#dc2626" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="card-hairline glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-ink mb-3">30-Day Projection</p>
                  {loading && <p className="text-xs text-ink/40">Loading…</p>}
                  {!loading && !prediction && (
                    <p className="text-xs text-ink/40">No prediction yet — velocity data needed first (requires 4+ hours of data).</p>
                  )}
                  {!loading && prediction && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-ink/50">Predicted Views</p>
                        <p className="text-2xl font-bold num text-red-700">{fmtNum(prediction.predicted_30d_views)}</p>
                        <p className="text-[10px] text-ink/40">range: {fmtNum(prediction.predicted_low)} – {fmtNum(prediction.predicted_high)}</p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-ink/50">Est. Revenue</p>
                        <p className="text-2xl font-bold num text-green-700">
                          ${prediction.revenue_low_usd.toFixed(0)} – ${prediction.revenue_high_usd.toFixed(0)}
                        </p>
                        <p className="text-[10px] text-ink/40">at $3 RPM default</p>
                      </div>
                      {prediction.model_r2 !== null && (
                        <p className="col-span-2 text-[10px] text-ink/40 text-center">
                          Model accuracy: {((prediction.model_r2 ?? 0) * 100).toFixed(0)}% R²
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

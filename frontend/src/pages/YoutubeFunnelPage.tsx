import { useEffect, useState } from "react";
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import apiClient from "../api/client";
import type { CrossPlatformResponse, CrossPlatformDay } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";

const DAYS_OPTIONS = [30, 90, 180] as const;

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const day = payload[0]?.payload as CrossPlatformDay;
  return (
    <div className="glass card-hairline rounded-xl p-3 text-xs shadow-lg">
      <p className="font-semibold text-ink mb-1">{day.day}</p>
      <p className="text-green-600">+{day.subscribers_gained} gained</p>
      <p className="text-red-500">−{day.subscribers_lost} lost</p>
      <p className="text-ink font-medium">Net: {day.net_subscribers >= 0 ? "+" : ""}{day.net_subscribers}</p>
      {day.has_instagram_reel && <p className="text-violet mt-1 font-medium">📸 Instagram Reel</p>}
    </div>
  );
};

export default function YoutubeFunnelPage() {
  const [days, setDays] = useState<typeof DAYS_OPTIONS[number]>(90);
  const [data, setData] = useState<CrossPlatformResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get<CrossPlatformResponse>(`/youtube/insights/cross-platform?days=${days}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const chartData = data?.days.map(d => ({ ...d, label: d.day.slice(5) })) ?? [];

  return (
    <YoutubeDashboardLayout active="Cross-Platform">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-ink mb-1">Cross-Platform ROI</h1>
            <p className="text-sm text-ink/50">Does Instagram drive YouTube subscribers?</p>
          </div>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  days === d ? "bg-red-600 text-white" : "bg-white/50 text-ink/60 hover:bg-white"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {data?.correlation !== undefined && data.correlation !== null && (
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <span className={`chip text-sm font-semibold ${
              (data.correlation ?? 0) > 0.5 ? "text-green-700 bg-green-50" :
              (data.correlation ?? 0) > 0.2 ? "text-amber-700 bg-amber-50" : "text-ink/50 bg-ink/5"
            }`}>
              Instagram → YouTube: {((data.correlation ?? 0) * 100).toFixed(0)}% correlation
            </span>
            <span className="text-[10px] text-ink/30">Pearson r — correlation, not causation</span>
          </div>
        )}

        {loading && <p className="text-sm text-ink/40 py-12 text-center">Loading…</p>}

        {!loading && chartData.length === 0 && (
          <div className="card-hairline glass rounded-2xl p-12 text-center text-ink/40 text-sm">
            No data yet. Connect both Instagram and YouTube and sync.
          </div>
        )}

        {!loading && chartData.length > 0 && (
          <div className="card-hairline glass rounded-2xl p-6">
            <p className="text-xs text-ink/50 mb-4">Purple lines = Instagram Reel posts · Area = daily YouTube subscribers</p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip content={<CustomTooltip />} />
                {data?.reel_posts.map(r => (
                  <ReferenceLine key={r.ig_media_id} x={r.post_date.slice(5)} stroke="#7c3aed" strokeDasharray="3 3" strokeOpacity={0.5} />
                ))}
                <Area type="monotone" dataKey="net_subscribers" stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} strokeWidth={2} name="Net subscribers" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {data && data.reel_posts.length > 0 && (
          <div className="card-hairline glass rounded-2xl p-4 mt-6">
            <p className="text-sm font-semibold text-ink mb-3">Instagram Reels in Period</p>
            <div className="space-y-2">
              {data.reel_posts.slice(0, 8).map(r => (
                <div key={r.ig_media_id} className="flex items-center gap-3 text-xs">
                  {r.thumbnail_url && <img src={r.thumbnail_url} className="w-10 h-10 rounded-lg object-cover" alt="" />}
                  <div>
                    <p className="text-ink/50">{r.post_date}</p>
                    <p className="line-clamp-1 text-ink/70">{r.caption?.slice(0, 80) || "No caption"}</p>
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

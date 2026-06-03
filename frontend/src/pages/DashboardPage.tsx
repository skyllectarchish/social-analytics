import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import axios from "axios";
import { Eye, Heart, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type {
  DashboardSummary,
  DemographicResponse,
  InstagramProfile,
  MetricTimeSeries,
  OverviewResponse,
} from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { mediaLabel } from "../lib/labels";
import Sparkline from "../components/charts/Sparkline";
import GlassTooltip from "../components/charts/GlassTooltip";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { PALETTE } from "../data/mock";

const DONUT = ["#8b5cf6", "#ec4899", "#f97316", "#60a5fa", "#34d399", "#a78bfa"];

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const toSpark = (s?: MetricTimeSeries) => (s?.data ?? []).map((p) => ({ v: p.value }));
const cumulative = (s?: MetricTimeSeries) => {
  let acc = 0;
  return (s?.data ?? []).map((p) => ({ v: (acc += p.value) }));
};
const trendPct = (arr: { v: number }[]) => {
  if (arr.length < 2) return 0;
  const first = arr[0].v || 1;
  return ((arr[arr.length - 1].v - first) / Math.abs(first)) * 100;
};

function MediaThumb({ id }: { id: string }) {
  const src = useAuthedImage(id);
  if (!src) return <div className="bg-lavender h-full w-full" aria-hidden />;
  return <img src={src} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);

  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [ageDemo, setAgeDemo] = useState<DemographicResponse | null>(null);
  const [genderDemo, setGenderDemo] = useState<DemographicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: prof } = await api.get<InstagramProfile>("/instagram/profile");
      setProfile(prof);

      const [sum, ov] = await Promise.all([
        api.get<DashboardSummary>("/instagram/insights/dashboard", { params: { days, top_n: 8 } }),
        api.get<OverviewResponse>("/instagram/insights/overview", { params: { days } }),
      ]);
      setSummary(sum.data);
      setOverview(ov.data);

      // Demographics are optional — don't fail the page if they're empty.
      const [age, gender] = await Promise.allSettled([
        api.get<DemographicResponse>("/instagram/insights/demographics", { params: { metric: "follower_demographics", breakdown: "age" } }),
        api.get<DemographicResponse>("/instagram/insights/demographics", { params: { metric: "follower_demographics", breakdown: "gender" } }),
      ]);
      setAgeDemo(age.status === "fulfilled" ? age.value.data : null);
      setGenderDemo(gender.status === "fulfilled" ? gender.value.data : null);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        navigate("/connect", { replace: true });
        return;
      }
      setError(errorMessage(err, "Could not load your dashboard"));
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
      await api.post("/instagram/refresh");
      await api.post("/instagram/insights/sync", null, { params: { lookback_days: days } });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ backgroundColor: "#F5F6FA" }}>
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  // KPI cards
  const reachSpark = toSpark(overview?.reach);
  const viewsSpark = toSpark(overview?.views);
  const interSpark = toSpark(overview?.total_interactions);
  const followSpark = cumulative(overview?.follows_and_unfollows);
  const engagement = summary && summary.total_reach > 0 ? (summary.total_interactions / summary.total_reach) * 100 : 0;

  const kpis = [
    { label: "Followers", value: profile ? fmt(profile.followers_count) : "—", spark: followSpark, trend: trendPct(followSpark), color: PALETTE.violet },
    { label: "Engagement", value: `${engagement.toFixed(2)}%`, spark: interSpark, trend: trendPct(interSpark), color: PALETTE.pink },
    { label: "Reach", value: summary ? fmt(summary.total_reach) : "—", spark: reachSpark, trend: trendPct(reachSpark), color: PALETTE.violet },
    { label: "Views", value: summary ? fmt(summary.total_views) : "—", spark: viewsSpark, trend: trendPct(viewsSpark), color: PALETTE.blue },
  ];

  // follower-growth area
  const growth =
    overview?.follows_and_unfollows.data.map((p) => ({
      d: new Date(p.end_time).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      v: p.value,
    })) ?? [];

  // audience age donut
  const ageData =
    ageDemo?.data
      ?.slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((d) => ({ name: d.dimension_value, value: d.value })) ?? [];
  const ageTotal = ageData.reduce((s, d) => s + d.value, 0) || 1;

  // gender split
  const genderTotal = genderDemo?.data.reduce((s, d) => s + d.value, 0) || 0;
  const genderPct = (key: string) => {
    if (!genderDemo || genderTotal === 0) return 0;
    const row = genderDemo.data.find((d) => d.dimension_value.toUpperCase().startsWith(key));
    return row ? Math.round((row.value / genderTotal) * 100) : 0;
  };

  return (
    <DashboardLayout days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        {/* greeting */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {greeting()}, {profile?.name?.split(" ")[0] || profile?.username || "there"}{" "}
            <span className="font-serif font-normal italic text-foreground/60">
              — here's your week.
            </span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            {profile ? `@${profile.username}` : ""} · {summary?.period_days ?? days}-day window
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => {
            const up = k.trend >= 0;
            return (
              <div key={k.label} className="card-hairline p-5">
                <div className="text-xs font-medium uppercase tracking-wider text-foreground/55">{k.label}</div>
                <div className="num mt-2 text-3xl font-semibold">{k.value}</div>
                <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-rose-500"}`}>
                  {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {up ? "+" : ""}{k.trend.toFixed(1)}% vs last period
                </div>
                <div className="mt-3 h-10">
                  <Sparkline data={k.spark} color={k.color} />
                </div>
              </div>
            );
          })}
        </div>

        {/* growth + audience */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card-hairline p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Follower growth</h2>
                <p className="text-xs text-foreground/55">
                  {summary && summary.net_follower_growth >= 0 ? "+" : ""}
                  {summary ? summary.net_follower_growth.toLocaleString() : "—"} net followers
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="chip !bg-lavender">Net follows</span>
              </div>
            </div>
            <div className="mt-4 h-72">
              {growth.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-foreground/50">
                  No insights yet — hit Sync to pull from Instagram.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growth} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
                    <defs>
                      <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => fmt(v as number)} />
                    <Tooltip cursor={{ stroke: PALETTE.violet, strokeWidth: 1 }} content={<GlassTooltip />} />
                    <Area type="monotone" dataKey="v" stroke={PALETTE.primary} strokeWidth={2.5} fill="url(#growthFill)" dot={false} activeDot={{ r: 4, fill: PALETTE.primary, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Audience age</h2>
            <p className="text-xs text-foreground/55">By follower count</p>
            {ageData.length === 0 ? (
              <div className="mt-2 grid h-48 place-items-center text-sm text-foreground/50">
                No demographic data yet.
              </div>
            ) : (
              <>
                <div className="mt-2 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={ageData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
                        {ageData.map((_, i) => (
                          <Cell key={i} fill={DONUT[i % DONUT.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<GlassTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {ageData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                      {d.name} · <span className="num">{Math.round((d.value / ageTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {genderTotal > 0 && (
              <div className="mt-4 border-t border-black/5 pt-3">
                <div className="text-xs text-foreground/55">Gender split</div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                  <div style={{ width: `${genderPct("F")}%`, background: "#ec4899" }} />
                  <div style={{ width: `${genderPct("M")}%`, background: "#8b5cf6" }} />
                  <div style={{ width: `${genderPct("U")}%`, background: "#60a5fa" }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-foreground/60">
                  <span>Female <span className="num font-semibold">{genderPct("F")}%</span></span>
                  <span>Male <span className="num font-semibold">{genderPct("M")}%</span></span>
                  <span>Other <span className="num font-semibold">{genderPct("U")}%</span></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* top posts */}
        <div className="card-hairline p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Top posts <span className="font-serif font-normal italic text-foreground/55">this period</span>
            </h2>
          </div>
          {summary && summary.top_posts.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {summary.top_posts.map((p) => (
                <a
                  key={p.ig_media_id}
                  href={p.permalink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-2xl ring-1 ring-black/5 transition hover:ring-violet/40"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <MediaThumb id={p.ig_media_id} />
                    <span className="chip absolute left-2 top-2 !border-white/10 !bg-black/50 !px-2 !py-0.5 !text-[10px] !text-white">
                      {mediaLabel(p.media_type)}
                    </span>
                    <div className="absolute inset-x-2 bottom-2 grid grid-cols-2 gap-1 text-[10px] text-white">
                      <span className="rounded-md bg-black/40 px-1.5 py-1 backdrop-blur">
                        <Heart className="mb-0.5 inline h-2.5 w-2.5" /> <span className="num">{fmt(p.interactions)}</span>
                      </span>
                      <span className="rounded-md bg-black/40 px-1.5 py-1 backdrop-blur">
                        <Eye className="mb-0.5 inline h-2.5 w-2.5" /> <span className="num">{fmt(p.views)}</span>
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <CardEmpty label="No top posts in this window yet — hit Sync to pull your posts from Instagram." />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

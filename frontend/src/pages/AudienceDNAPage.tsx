import { useEffect, useState } from "react";
import {
  CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty, PageLoading } from "../components/dashboard/States";
import GlassTooltip from "../components/charts/GlassTooltip";
import { useSync } from "../hooks/useSync";
import { safeGet } from "../api/client";
import type {
  FollowerQualityResponse, FollowerSpikesResponse, SentimentSummaryResponse, TopicsResponse,
} from "../api/types";
import { PALETTE } from "../data/mock";

type Slice = { name: string; value: number; color: string };
type Spike = { date: string; text: string; gain: string };
type Cohort = { label: string; followers: number; eng: number; tier: string };
const fmt = (n: number) => (n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

export default function AudienceDNAPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);

  const [radar, setRadar] = useState<{ axis: string; v: number }[]>([]);
  const [sentiment, setSentiment] = useState<Slice[]>([]);
  const [trend, setTrend] = useState<{ w: string; pos: number }[]>([]);
  const [topics, setTopics] = useState<{ t: string; size: number }[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [spikes, setSpikes] = useState<Spike[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [sent, tops, spk, fq] = await Promise.all([
        safeGet<SentimentSummaryResponse>("/instagram/insights/sentiment", { days }),
        safeGet<TopicsResponse>("/instagram/insights/sentiment/topics", { days }),
        // threshold=10 surfaces spikes for normal-sized accounts (default 50 hides most)
        safeGet<FollowerSpikesResponse>("/instagram/insights/follower-quality/spikes", { days, threshold: 10 }),
        safeGet<FollowerQualityResponse>("/instagram/insights/follower-quality", { breakdown: "age" }),
      ]);
      if (!alive) return;

      if (sent && sent.total > 0) {
        const d = sent.distribution;
        const t = d.positive + d.neutral + d.negative || 1;
        setSentiment([
          { name: "Positive", value: Math.round((d.positive / t) * 100), color: "#10b981" },
          { name: "Neutral", value: Math.round((d.neutral / t) * 100), color: "#a3a3a3" },
          { name: "Negative", value: Math.round((d.negative / t) * 100), color: "#ef4444" },
        ]);
        setTrend(sent.trend.map((p, i) => {
          const tot = p.positive + p.neutral + p.negative || 1;
          return { w: `W${i + 1}`, pos: Math.round((p.positive / tot) * 100) };
        }));
      } else { setSentiment([]); setTrend([]); }

      if (tops?.topics.length) {
        const sorted = [...tops.topics].sort((a, b) => b.size - a.size).slice(0, 12);
        setTopics(sorted.map((t, i) => ({ t: t.label, size: +(1.23 - i * 0.04).toFixed(2) })));
      } else setTopics([]);

      if (spk?.spikes.length) {
        setSpikes(spk.spikes.slice(0, 6).map((s) => ({
          date: new Date(s.spike_date).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
          text: s.is_suspicious ? "Unusual follower spike" : "Follower growth spike",
          gain: `+${s.follows_change.toLocaleString()}`,
        })));
      } else setSpikes([]);

      if (fq?.cohorts.length) {
        const cs = fq.cohorts;
        setRadar(cs.slice(0, 6).map((c) => ({ axis: c.dimension_value, v: +c.engagement_rate_pct.toFixed(1) })));
        setCohorts(cs.map((c) => ({ label: c.dimension_value, followers: c.follower_count, eng: +c.engagement_rate_pct.toFixed(1), tier: c.quality_tier })));
      } else { setRadar([]); setCohorts([]); }

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days]);

  const maxEng = Math.max(...cohorts.map((c) => c.eng), 1);

  return (
    <DashboardLayout active="Audience DNA" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Audience <span className="text-aurora">DNA</span></h1>
            <p className="mt-1 text-sm text-foreground/55">Audience health, sentiment and quality — from your real data.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Engagement by cohort</h2>
              <p className="text-xs text-foreground/55">Engagement rate across age groups</p>
              <div className="h-64">
                {radar.length < 3 ? <CardEmpty label="No cohort data yet." /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radar} outerRadius="70%">
                      <PolarGrid stroke={PALETTE.grid} />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: PALETTE.muted }} />
                      <Radar dataKey="v" stroke={PALETTE.primary} strokeWidth={2} fill={PALETTE.violet} fillOpacity={0.15} />
                      <Tooltip content={<GlassTooltip unit="%" />} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Sentiment</h2>
              <p className="text-xs text-foreground/55">From recent comments</p>
              {sentiment.length === 0 ? <CardEmpty label="No analyzed comments yet." /> : (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sentiment} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
                          {sentiment.map((s) => <Cell key={s.name} fill={s.color} />)}
                        </Pie>
                        <Tooltip content={<GlassTooltip unit="%" />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1 text-xs">
                    {sentiment.map((s) => (
                      <div key={s.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                        <span className="num font-semibold">{s.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Sentiment trend</h2>
              <div className="h-64">
                {trend.length === 0 ? <CardEmpty label="No sentiment history yet." /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 12, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                      <XAxis dataKey="w" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
                      <Tooltip cursor={{ stroke: PALETTE.violet, strokeWidth: 1 }} content={<GlassTooltip unit="%" />} />
                      <Line type="monotone" dataKey="pos" stroke={PALETTE.pink} strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Topic affinity</h2>
            <p className="text-xs text-foreground/55">What your audience actually talks about</p>
            {topics.length === 0 ? <CardEmpty label="No topics detected yet." /> : (
              <div className="mt-4 flex flex-wrap gap-2">
                {topics.map((t) => <span key={t.t} className="chip" style={{ fontSize: `${t.size}rem` }}>{t.t}</span>)}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Follower quality by cohort</h2>
              {cohorts.length === 0 ? <CardEmpty label="No follower-quality data yet." /> : (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-foreground/55">
                    <tr><th className="pb-2">Cohort</th><th className="pb-2">Followers</th><th className="pb-2">Engagement</th></tr>
                  </thead>
                  <tbody>
                    {cohorts.map((c) => (
                      <tr key={c.label} className="border-t border-black/5">
                        <td className="py-2.5 font-medium">{c.label} <span className="text-[10px] text-foreground/50">{c.tier}</span></td>
                        <td className="num py-2.5">{fmt(c.followers)}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-lavender">
                              <div className="h-full rounded-full bg-gradient-to-r from-violet to-pink-500" style={{ width: `${Math.round((c.eng / maxEng) * 100)}%` }} />
                            </div>
                            <span className="num text-xs">{c.eng}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Growth spikes</h2>
              <p className="text-xs text-foreground/55">Annotated follower-growth events</p>
              {spikes.length === 0 ? <CardEmpty label="No growth spikes detected yet." /> : (
                <ol className="relative mt-4 space-y-4 border-l-2 border-lavender pl-4">
                  {spikes.map((s, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full bg-white ring-2 ring-violet"><span className="h-1.5 w-1.5 rounded-full bg-violet" /></span>
                      <div className="num text-xs text-foreground/55">{s.date}</div>
                      <div className="text-sm font-medium">{s.text}</div>
                      <div className="num text-xs text-emerald-600">{s.gain} followers</div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

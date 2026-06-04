import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ExternalLink, HelpCircle,
  Loader2, MessageCircleQuestion, ShieldAlert, Sprout,
} from "lucide-react";
import { motion } from "framer-motion";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { PageSkeleton, StatSkeleton, Skeleton } from "../components/dashboard/Skeletons";
import PostInsightsDrawer, { type DrawerMedia } from "../components/dashboard/PostInsightsDrawer";
import GlassTooltip from "../components/charts/GlassTooltip";
import { AnimatedCard, AnimatedNumber } from "../components/ui/Motion";
import { usePeriodComparator } from "../context/PeriodComparatorContext";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { useSync } from "../hooks/useSync";
import api, { safeGet } from "../api/client";
import type {
  FollowerQualityResponse, FollowerQualitySummary, FollowerSpike, FollowerSpikesResponse,
  GrowthCorrelationResponse, GrowthDriverItem, GrowthDriversResponse,
  QuestionPostsResponse, SeedDemoResponse, SentimentDiagnoseResponse,
  SentimentSummaryResponse, TopicsResponse,
} from "../api/types";
import { PALETTE } from "../data/mock";

type Slice = { name: string; value: number; color: string };
type Cohort = { label: string; followers: number; engaged: number; eng: number; tier: string };
type SpikeDot = {
  t: number; gain: number; mag: number; date: string; interactions: number;
  ratio: number; suspicious: boolean; drivers: GrowthDriverItem[];
};
type SortKey = "followers" | "eng";
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

function MiniThumb({ igId, className = "h-10 w-10" }: { igId: string; className?: string }) {
  const src = useAuthedImage(igId);
  return src ? (
    <img src={src} alt="" className={`${className} shrink-0 rounded-lg object-cover ring-1 ring-black/5`} />
  ) : (
    <div className={`bg-lavender ${className} shrink-0 rounded-lg`} />
  );
}

// Conversion-rate chip: green ≥2%, amber ≥0.5%, muted below.
const convChip = (pct: number) =>
  pct >= 2
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : pct >= 0.5
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-black/5 text-foreground/60 ring-black/10";

// Pearson r → human interpretation, mirroring the old GrowthCorrelationChart.
function describeCorrelation(r: number | null): { label: string; tone: string } {
  if (r == null) return { label: "Not enough data", tone: "text-foreground/50" };
  const a = Math.abs(r);
  const dir = r >= 0 ? "positive" : "negative";
  if (a < 0.2) return { label: "Effectively none", tone: "text-foreground/55" };
  if (a < 0.4) return { label: `Weakly ${dir}`, tone: r >= 0 ? "text-emerald-600" : "text-rose-500" };
  if (a < 0.7) return { label: `Moderately ${dir}`, tone: r >= 0 ? "text-emerald-600" : "text-rose-500" };
  return { label: `Strongly ${dir}`, tone: r >= 0 ? "text-emerald-700" : "text-rose-600" };
}

// Diagnostic banner for an empty Audience Voice section, with the synthetic
// data seeder so the section can be previewed before real comments arrive.
function VoiceEmptyBanner({ diagnose, onSeeded }: { diagnose: SentimentDiagnoseResponse; onSeeded: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const title =
    diagnose.status === "scope_blocked"
      ? "Comment data isn't reaching us yet"
      : diagnose.status === "no_data"
        ? "No comments to analyse yet"
        : "Audience Voice is warming up";

  async function seed() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const { data } = await api.post<SeedDemoResponse>("/instagram/insights/sentiment/seed-demo");
      setSeedMsg(`Seeded ${data.comments} comments · ${data.sentiment} sentiment rows · ${data.topics} topics`);
      onSeeded();
    } catch {
      setSeedMsg("Seeding failed — check the backend logs.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-amber-900">{title}</div>
          <p className="mt-0.5 text-xs text-amber-800/80">{diagnose.reason}</p>
          {diagnose.status === "scope_blocked" && (
            <button onClick={() => setExpanded(!expanded)} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline">
              How to fix this <ChevronDown className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
          {expanded && (
            <div className="mt-2 space-y-1 rounded-xl bg-white/60 p-3 text-xs text-amber-900/90">
              <p>Meta filters comment payloads until the app has Advanced Access on <code className="rounded bg-black/5 px-1">instagram_business_manage_comments</code>. Two ways out:</p>
              <p>1. Add this Instagram account as a <strong>tester</strong> of the Meta app (instant).</p>
              <p>2. Submit the app for <strong>App Review</strong> on that permission (takes days, works for everyone).</p>
            </div>
          )}
        </div>
        <div className="text-right">
          <button onClick={seed} disabled={seeding} className="btn-glow !px-3.5 !py-2 text-xs disabled:opacity-60">
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />} Seed demo data
          </button>
          <p className="mt-1 max-w-[180px] text-[10px] text-amber-800/60">
            Synthetic rows, tagged for clean-up via purge.
          </p>
        </div>
      </div>
      {seedMsg && <p className="mt-2 text-xs font-medium text-amber-900">{seedMsg}</p>}
    </div>
  );
}

const BREAKDOWNS = [
  { value: "age", label: "Age" },
  { value: "gender", label: "Gender" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
] as const;
type Breakdown = (typeof BREAKDOWNS)[number]["value"];

const TIER_BADGE: Record<string, string> = {
  HIGH: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  LOW: "bg-black/5 text-foreground/60 ring-black/10",
  DORMANT: "bg-rose-50 text-rose-600 ring-rose-200",
};

function SpikeTooltip({ active, payload }: { active?: boolean; payload?: { payload: SpikeDot }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-black/5 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-semibold">{d.date}</div>
      <div className="num mt-1">+{d.gain.toLocaleString()} followers</div>
      <div className="num text-foreground/60">{d.interactions.toLocaleString()} interactions · ratio {d.ratio.toFixed(2)}</div>
      {d.suspicious && <div className="mt-1 font-medium text-rose-600">⚠ flagged suspicious</div>}
    </div>
  );
}

export default function AudienceDNAPage() {
  const [days, setDays] = useState(30);
  const { compareTo } = usePeriodComparator();
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);
  const [qualityLoading, setQualityLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<Breakdown>("age");

  const [summary, setSummary] = useState<FollowerQualitySummary | null>(null);
  const [radar, setRadar] = useState<{ axis: string; followers: number; engaged: number }[]>([]);
  const [sentiment, setSentiment] = useState<Slice[]>([]);
  const [trend, setTrend] = useState<{ w: string; pos: number }[]>([]);
  const [topics, setTopics] = useState<{ t: string; size: number; isQuestion: boolean }[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [spikes, setSpikes] = useState<SpikeDot[]>([]);
  const [advisory, setAdvisory] = useState<SpikeDot | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "eng", dir: -1 });
  const [drivers, setDrivers] = useState<GrowthDriversResponse | null>(null);
  const [correlation, setCorrelation] = useState<GrowthCorrelationResponse | null>(null);
  const [questions, setQuestions] = useState<QuestionPostsResponse | null>(null);
  const [diagnose, setDiagnose] = useState<SentimentDiagnoseResponse | null>(null);
  const [drawer, setDrawer] = useState<DrawerMedia>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Seeding triggers a refetch that should NOT blank the page to skeletons —
  // the banner's confirmation message must stay visible.
  const softReload = useRef(false);

  // Window-dependent data (sentiment, topics, spikes, growth engine).
  useEffect(() => {
    let alive = true;
    if (!softReload.current) setLoading(true);
    softReload.current = false;
    setAdvisory(null);
    (async () => {
      const cmp = compareTo ? { compare_to: compareTo } : {};
      const [sent, tops, spk, drv, corr, qs, diag] = await Promise.all([
        safeGet<SentimentSummaryResponse>("/instagram/insights/sentiment", { days, ...cmp }),
        safeGet<TopicsResponse>("/instagram/insights/sentiment/topics", { days }),
        // threshold=10 surfaces spikes for normal-sized accounts (default 50 hides most)
        safeGet<FollowerSpikesResponse>("/instagram/insights/follower-quality/spikes", { days, threshold: 10 }),
        safeGet<GrowthDriversResponse>("/instagram/insights/growth-drivers", { days: Math.max(days, 7), limit: 10, ...cmp }),
        safeGet<GrowthCorrelationResponse>("/instagram/insights/growth-correlation", { days: Math.max(days, 7), ...cmp }),
        safeGet<QuestionPostsResponse>("/instagram/insights/sentiment/questions", { days, limit: 8 }),
        safeGet<SentimentDiagnoseResponse>("/instagram/insights/sentiment/diagnose"),
      ]);
      if (!alive) return;
      setDrivers(drv);
      setCorrelation(corr);
      setQuestions(qs);
      setDiagnose(diag);

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
        setTopics(sorted.map((t, i) => ({ t: t.label, size: +(1.23 - i * 0.04).toFixed(2), isQuestion: t.is_question })));
      } else setTopics([]);

      const maxGain = Math.max(...(spk?.spikes ?? []).map((s) => Math.abs(s.follows_change)), 1);
      setSpikes(
        (spk?.spikes ?? []).map((s: FollowerSpike) => ({
          t: new Date(s.spike_date).getTime(),
          gain: s.follows_change,
          mag: 40 + Math.round((Math.abs(s.follows_change) / maxGain) * 260),
          date: new Date(s.spike_date).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
          interactions: s.interactions,
          ratio: s.interaction_per_follow_ratio,
          suspicious: s.is_suspicious,
          drivers: s.candidate_drivers ?? [],
        })),
      );

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days, compareTo, reloadKey]);

  // Breakdown-dependent data (cohorts + summary).
  useEffect(() => {
    let alive = true;
    setQualityLoading(true);
    (async () => {
      const [fq, sum] = await Promise.all([
        safeGet<FollowerQualityResponse>("/instagram/insights/follower-quality", { breakdown }),
        safeGet<FollowerQualitySummary>("/instagram/insights/follower-quality/summary", { breakdown }),
      ]);
      if (!alive) return;

      setSummary(sum);
      if (fq?.cohorts.length) {
        const cs = fq.cohorts;
        const maxF = Math.max(...cs.map((c) => c.follower_count), 1);
        setRadar(
          cs.slice(0, 8).map((c) => ({
            axis: c.dimension_value,
            followers: Math.round((c.follower_count / maxF) * 100),
            engaged: Math.round((c.engaged_count / maxF) * 100),
          })),
        );
        setCohorts(cs.map((c) => ({
          label: c.dimension_value,
          followers: c.follower_count,
          engaged: c.engaged_count,
          eng: +c.engagement_rate_pct.toFixed(1),
          tier: c.quality_tier.toUpperCase(),
        })));
      } else { setRadar([]); setCohorts([]); }
      setQualityLoading(false);
    })();
    return () => { alive = false; };
  }, [breakdown]);

  const maxEng = Math.max(...cohorts.map((c) => c.eng), 1);
  const sortedCohorts = useMemo(() => {
    const sel: Record<SortKey, (c: Cohort) => number> = { followers: (c) => c.followers, eng: (c) => c.eng };
    return [...cohorts].sort((a, b) => (sel[sort.key](a) - sel[sort.key](b)) * sort.dir);
  }, [cohorts, sort]);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="pb-2">
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-foreground/80">
        {label}
        {sort.key === k ? (sort.dir === -1 ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  );

  const summaryCards = summary
    ? [
        { label: "Quality score", num: summary.overall_quality_pct, format: (v: number) => `${v.toFixed(1)}%`, sub: "engaged ÷ tracked", subClass: "text-violet-deep" },
        { label: "High-quality cohorts", num: summary.high_quality_cohorts, format: (v: number) => `${Math.round(v)}`, sub: `of ${summary.total_cohorts}`, subClass: "text-emerald-600" },
        { label: "Dormant cohorts", num: summary.dormant_cohorts, format: (v: number) => `${Math.round(v)}`, sub: "ghost followers live here", subClass: "text-rose-500" },
        { label: "Followers tracked", num: summary.total_followers_tracked, format: fmt, sub: `${fmt(summary.total_engaged_tracked)} engaged` },
      ]
    : [];

  return (
    <DashboardLayout active="Audience DNA" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <PageSkeleton stats={4} charts={3} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <AnimatedCard>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Audience <span className="text-aurora">DNA</span></h1>
              <p className="mt-1 text-sm text-foreground/55">Audience health, sentiment and quality — from your real data.</p>
            </AnimatedCard>
            <AnimatedCard delay={0.05} className="flex gap-1.5">
              {BREAKDOWNS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setBreakdown(b.value)}
                  className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    breakdown === b.value ? "text-violet-deep" : "text-foreground/60 hover:text-foreground/90"
                  }`}
                >
                  {breakdown === b.value && (
                    <motion.span
                      layoutId="breakdown-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-violet/25"
                      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                    />
                  )}
                  <span className="relative">{b.label}</span>
                </button>
              ))}
            </AnimatedCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {qualityLoading ? (
              [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)
            ) : summaryCards.length === 0 ? (
              <div className="card-hairline sm:col-span-2 lg:col-span-4">
                <CardEmpty label="No follower-quality summary yet — Sync to compute it." />
              </div>
            ) : (
              summaryCards.map((k, i) => (
                <AnimatedCard key={k.label} delay={0.05 * i} className="card-hairline p-5">
                  <div className="text-xs uppercase tracking-wider text-foreground/55">{k.label}</div>
                  <div className="num mt-2 text-3xl font-semibold">
                    <AnimatedNumber value={k.num} format={k.format} />
                  </div>
                  <div className={`mt-1 text-xs ${k.subClass ?? "text-foreground/55"}`}>{k.sub}</div>
                </AnimatedCard>
              ))
            )}
          </div>

          {/* growth engine: which posts actually bring followers */}
          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatedCard delay={0.08} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Growth drivers</h2>
              <p className="text-xs text-foreground/55">Posts ranked by attributed new followers</p>
              {!drivers || drivers.drivers.length === 0 ? (
                <CardEmpty label="No driver activity yet — needs at least 7 days of follower history." />
              ) : (
                <>
                  <div className="mt-2 max-h-80 divide-y divide-black/5 overflow-y-auto pr-1">
                    {drivers.drivers.map((d, i) => (
                      <button
                        key={d.ig_media_id}
                        onClick={() => setDrawer({ igId: d.ig_media_id, title: d.caption, permalink: d.permalink })}
                        className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-violet/5"
                      >
                        <span className="num w-5 text-xs text-foreground/40">{i + 1}</span>
                        <MiniThumb igId={d.ig_media_id} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-sm font-medium">{d.caption || "Untitled post"}</span>
                          <span className="text-xs text-foreground/55">
                            {d.media_product_type === "REELS" ? "Reel" : "Post"} · <span className="num">{fmt(d.reach)}</span> reach
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="num block text-sm font-semibold text-emerald-600">
                            +{Math.round(d.attributed_follows).toLocaleString()}
                          </span>
                          <span className={`num rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${convChip(d.conversion_rate_pct)}`}>
                            {d.conversion_rate_pct.toFixed(2)}%
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-foreground/45">
                    Rates use non-follower reach when available; conservative same-day/+1d attribution.
                  </p>
                </>
              )}
            </AnimatedCard>

            <AnimatedCard delay={0.12} className="card-hairline p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Reach → follows correlation</h2>
                  <p className="text-xs text-foreground/55">Do high-reach days actually convert?</p>
                </div>
                {correlation && (
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${describeCorrelation(correlation.correlation).tone}`}>
                      {describeCorrelation(correlation.correlation).label}
                    </div>
                    {correlation.correlation != null && (
                      <div className="num text-xs text-foreground/50">r = {correlation.correlation.toFixed(2)}</div>
                    )}
                  </div>
                )}
              </div>
              {!correlation || correlation.points.length < 3 ? (
                <CardEmpty label="Need at least 3 days of follower data to compute correlation." />
              ) : (
                <>
                  <div className="mt-2 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 12, right: 12, bottom: 0, left: -4 }}>
                        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                        <XAxis
                          dataKey="reach"
                          type="number"
                          name="Reach"
                          tick={{ fontSize: 10, fill: PALETTE.muted }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => fmt(v)}
                        />
                        <YAxis dataKey="follows" type="number" name="Follows" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} />
                        <Tooltip content={<GlassTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter data={correlation.points} fill={PALETTE.violet} fillOpacity={0.7} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  {!correlation.uses_non_follower_reach && (
                    <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700 ring-1 ring-amber-200">
                      Non-follower reach hasn't synced yet — using total reach as a rough proxy.
                    </p>
                  )}
                </>
              )}
            </AnimatedCard>
          </div>

          {diagnose && (diagnose.status !== "ok" || diagnose.stored_comments === 0) && (
            <AnimatedCard delay={0.1}>
              <VoiceEmptyBanner
                diagnose={diagnose}
                onSeeded={() => { softReload.current = true; setReloadKey((k) => k + 1); }}
              />
            </AnimatedCard>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <AnimatedCard delay={0.1} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Cohort quality radar</h2>
              <p className="text-xs text-foreground/55">Followers vs engaged — the gap is your dormant segment</p>
              <div className="h-64">
                {qualityLoading ? (
                  <Skeleton className="mt-4 h-52 w-full" />
                ) : radar.length < 3 ? (
                  <CardEmpty label="No cohort data yet." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radar} outerRadius="70%">
                      <PolarGrid stroke={PALETTE.grid} />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: PALETTE.muted }} />
                      <Radar name="Followers" dataKey="followers" stroke={PALETTE.primary} strokeWidth={2} fill={PALETTE.violet} fillOpacity={0.18} />
                      <Radar name="Engaged" dataKey="engaged" stroke={PALETTE.pink} strokeWidth={2} fill={PALETTE.pink} fillOpacity={0.08} />
                      <Tooltip content={<GlassTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="mt-1 flex gap-4 text-[10px] text-foreground/55">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PALETTE.primary }} /> Followers</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PALETTE.pink }} /> Engaged</span>
              </div>
            </AnimatedCard>

            <AnimatedCard delay={0.15} className="card-hairline p-5">
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
            </AnimatedCard>

            <AnimatedCard delay={0.2} className="card-hairline p-5">
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
            </AnimatedCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatedCard delay={0.25} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Topic affinity</h2>
              <p className="text-xs text-foreground/55">What your audience actually talks about</p>
              {topics.length === 0 ? <CardEmpty label="No topics detected yet." /> : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {topics.map((t) => (
                    <span key={t.t} className="chip" style={{ fontSize: `${t.size}rem` }}>
                      {t.isQuestion && <HelpCircle className="h-[0.9em] w-[0.9em] text-amber-500" />}
                      {t.t}
                    </span>
                  ))}
                </div>
              )}
            </AnimatedCard>

            <AnimatedCard delay={0.28} className="card-hairline p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MessageCircleQuestion className="h-4 w-4 text-amber-500" /> Posts sparking questions
              </h2>
              <p className="text-xs text-foreground/55">Your audience wants more — answer these in your next post</p>
              {!questions || questions.posts.length === 0 ? (
                <CardEmpty label="No question comments detected in this window." />
              ) : (
                <div className="mt-2 max-h-72 divide-y divide-black/5 overflow-y-auto pr-1">
                  {questions.posts.map((q) => (
                    <button
                      key={q.ig_media_id}
                      onClick={() => setDrawer({ igId: q.ig_media_id, title: q.caption, permalink: q.permalink })}
                      className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-violet/5"
                    >
                      <MiniThumb igId={q.ig_media_id} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-sm font-medium">{q.caption || "Untitled post"}</span>
                        <span className="num text-xs text-foreground/55">
                          {new Date(q.timestamp).toLocaleDateString(undefined, { month: "short", day: "2-digit" })} · {q.total_comments} comments
                        </span>
                      </span>
                      <span className="num rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        {q.question_count} ?
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-foreground/30" />
                    </button>
                  ))}
                </div>
              )}
            </AnimatedCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnimatedCard delay={0.3} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Follower quality by cohort</h2>
              <p className="text-xs text-foreground/55">By {BREAKDOWNS.find((b) => b.value === breakdown)?.label.toLowerCase()}</p>
              {qualityLoading ? (
                <div className="mt-3 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              ) : cohorts.length === 0 ? (
                <CardEmpty label="No follower-quality data yet." />
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-[10px] text-foreground/55">
                    <tr>
                      <th className="pb-2 uppercase tracking-wider">Cohort</th>
                      <SortHeader label="Followers" k="followers" />
                      <SortHeader label="Engagement" k="eng" />
                      <th className="pb-2 uppercase tracking-wider">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCohorts.map((c) => (
                      <motion.tr key={c.label} layout transition={{ type: "spring", duration: 0.4, bounce: 0 }} className="border-t border-black/5">
                        <td className="py-2.5 font-medium">{c.label}</td>
                        <td className="num py-2.5">{fmt(c.followers)}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-lavender">
                              <div className="h-full rounded-full bg-gradient-to-r from-violet to-pink-500" style={{ width: `${Math.round((c.eng / maxEng) * 100)}%` }} />
                            </div>
                            <span className="num text-xs">{c.eng}%</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${TIER_BADGE[c.tier] ?? TIER_BADGE.LOW}`}>
                            {c.tier}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AnimatedCard>

            <AnimatedCard delay={0.35} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Growth spikes</h2>
              <p className="text-xs text-foreground/55">Follower jumps over time — rose dots look suspicious</p>
              {spikes.length === 0 ? <CardEmpty label="No growth spikes detected yet." /> : (
                <>
                  <div className="mt-2 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
                        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin - 86400000", "dataMax + 86400000"]}
                          tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
                          tick={{ fontSize: 10, fill: PALETTE.muted }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis dataKey="gain" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `+${fmt(v)}`} />
                        <ZAxis dataKey="mag" range={[40, 300]} />
                        <Tooltip content={<SpikeTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter
                          data={spikes.filter((s) => !s.suspicious)}
                          fill={PALETTE.violet}
                          fillOpacity={0.75}
                          onClick={(d) => setAdvisory((d as { payload?: SpikeDot }).payload ?? null)}
                          cursor="pointer"
                        />
                        <Scatter
                          data={spikes.filter((s) => s.suspicious)}
                          fill="#f43f5e"
                          fillOpacity={0.85}
                          onClick={(d) => setAdvisory((d as { payload?: SpikeDot }).payload ?? null)}
                          cursor="pointer"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  {advisory && (
                    <div className={`mt-2 rounded-xl p-3 text-xs ring-1 ${advisory.suspicious ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-violet/5 text-foreground/70 ring-violet/15"}`}>
                      <div className="flex items-start gap-2.5">
                        {advisory.suspicious && <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span>
                          <strong>{advisory.date}:</strong> +{advisory.gain.toLocaleString()} followers ·{" "}
                          {advisory.interactions.toLocaleString()} interactions (ratio {advisory.ratio.toFixed(2)}).
                          {advisory.suspicious &&
                            " Low engagement on a big jump often means bot or giveaway followers — expect a quality dip in these cohorts."}
                        </span>
                      </div>
                      <div className="mt-2 border-t border-black/5 pt-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
                          Candidate driver posts (24h window)
                        </div>
                        {advisory.drivers.length === 0 ? (
                          <p className="mt-1 text-foreground/50">No candidate posts in the 24h window before this spike.</p>
                        ) : (
                          <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                            {advisory.drivers.map((d) => (
                              <button
                                key={d.ig_media_id}
                                onClick={() => setDrawer({ igId: d.ig_media_id, title: d.caption, permalink: d.permalink })}
                                className="flex w-56 shrink-0 items-center gap-2 rounded-xl bg-white p-2 text-left ring-1 ring-black/5 transition hover:ring-violet/40"
                              >
                                <MiniThumb igId={d.ig_media_id} className="h-9 w-9" />
                                <span className="min-w-0 flex-1">
                                  <span className="line-clamp-1 text-xs font-medium text-foreground/85">{d.caption || "Untitled post"}</span>
                                  <span className="num text-[10px] font-semibold text-emerald-600">
                                    +{Math.round(d.attributed_follows)} followers
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </AnimatedCard>
          </div>
        </div>
      )}

      <PostInsightsDrawer media={drawer} onClose={() => setDrawer(null)} />
    </DashboardLayout>
  );
}

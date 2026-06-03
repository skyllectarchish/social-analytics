import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Play, Timer } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { PageSkeleton } from "../components/dashboard/Skeletons";
import PostInsightsDrawer, { type DrawerMedia } from "../components/dashboard/PostInsightsDrawer";
import GlassTooltip from "../components/charts/GlassTooltip";
import { AnimatedCard, AnimatedNumber } from "../components/ui/Motion";
import { useSync } from "../hooks/useSync";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { safeGet } from "../api/client";
import type { ReelRetentionItem, ReelsRetentionResponse, ReelsTrendResponse } from "../api/types";
import { PALETTE } from "../data/mock";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);
const grade = (p: number) => (p >= 85 ? "A" : p >= 75 ? "A−" : p >= 65 ? "B+" : p >= 55 ? "B" : p >= 45 ? "C+" : "C");

type Kpi = { label: string; num: number | null; format: (v: number) => string; sub: string; subClass?: string };
type SortKey = "hook" | "watch" | "skip" | "views";
type TrendPoint = { week: string; hook: number; watch: number };

const hookPill = (pct: number) =>
  pct >= 80
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : pct >= 60
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-rose-50 text-rose-600 ring-rose-200";

function ReelThumb({ igId }: { igId: string }) {
  const src = useAuthedImage(igId);
  return src ? (
    <img src={src} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover ring-1 ring-black/5" />
  ) : (
    <div className="bg-lavender h-12 w-9 shrink-0 rounded-lg" />
  );
}

function ReelCard({ r, onOpen }: { r: ReelRetentionItem; onOpen: (m: DrawerMedia) => void }) {
  const src = useAuthedImage(r.ig_media_id);
  const title = r.caption_preview || "Reel";
  return (
    <button
      onClick={() => onOpen({ igId: r.ig_media_id, title, permalink: r.permalink })}
      className="group overflow-hidden rounded-2xl text-left ring-1 ring-black/5 transition hover:ring-violet/40"
    >
      <div className="relative aspect-[9/16]">
        {src ? <img src={src} alt={title} className="h-full w-full object-cover" /> : <div className="bg-lavender h-full w-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0" />
        <div className="chip absolute left-2 top-2 !border-white/10 !bg-black/50 !px-2 !py-0.5 !text-[10px] !text-white"><Play className="h-2.5 w-2.5" /> Reel</div>
        <div className="absolute inset-x-3 bottom-3 space-y-2">
          <div className="line-clamp-1 text-sm font-medium text-white">{title}</div>
          <div className="flex flex-wrap gap-1 text-[10px] text-white">
            <span className="rounded-md bg-black/40 px-1.5 py-1 backdrop-blur"><Eye className="mb-0.5 inline h-2.5 w-2.5" /> <span className="num">{fmt(r.views)}</span></span>
            <span className="rounded-md bg-violet/80 px-1.5 py-1 backdrop-blur"><Timer className="mb-0.5 inline h-2.5 w-2.5" /> <span className="num">{r.hook_strength_pct.toFixed(1)}%</span></span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function ReelsStudioPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [reels, setReels] = useState<ReelRetentionItem[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "hook", dir: -1 });
  const [drawer, setDrawer] = useState<DrawerMedia>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      // Reels are sparse, so floor the window at 90d — short selections (7/30)
      // would otherwise return nothing even when the account has reels.
      const window = Math.max(days, 90);
      const [res, tr] = await Promise.all([
        safeGet<ReelsRetentionResponse>("/instagram/insights/reels-retention", { days: window, limit: 20 }),
        // Trend endpoint floors at 30d; use a longer window so the weekly line has shape.
        safeGet<ReelsTrendResponse>("/instagram/insights/reels-retention/trend", { days: Math.max(window, 180) }),
      ]);
      if (!alive) return;

      if (res?.reels.length) {
        const rs = res.reels;
        const avg = (sel: (r: ReelRetentionItem) => number) => rs.reduce((s, r) => s + sel(r), 0) / rs.length;
        const avgHook = avg((r) => r.hook_strength_pct);
        const avgWatch = avg((r) => r.avg_watch_time);
        const avgSkip = avg((r) => r.skip_rate);
        const totalPlays = rs.reduce((s, r) => s + r.views, 0);
        setKpis([
          { label: "Hook strength", num: avgHook, format: (v) => `${v.toFixed(1)}%`, sub: `grade ${grade(avgHook)}`, subClass: "text-violet-deep" },
          { label: "Avg watch time", num: avgWatch, format: (v) => `${v.toFixed(1)}s`, sub: "per reel" },
          {
            label: "Avg skip rate",
            num: avgSkip,
            format: (v) => `${v.toFixed(1)}%`,
            sub: avgSkip <= 35 ? "healthy" : "needs stronger hooks",
            subClass: avgSkip <= 35 ? "text-emerald-600" : "text-rose-500",
          },
          { label: "Total plays", num: totalPlays, format: fmt, sub: `${rs.length} reels · last ${window}d` },
        ]);
        setReels(rs);
      } else {
        setKpis([]);
        setReels([]);
      }

      setTrend(
        (tr?.trend ?? []).map((p) => ({
          week: new Date(p.week_start).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
          hook: +p.avg_hook_strength_pct.toFixed(1),
          watch: +p.avg_watch_time_sec.toFixed(1),
        })),
      );

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days]);

  const sorted = useMemo(() => {
    const sel: Record<SortKey, (r: ReelRetentionItem) => number> = {
      hook: (r) => r.hook_strength_pct,
      watch: (r) => r.avg_watch_time,
      skip: (r) => r.skip_rate,
      views: (r) => r.views,
    };
    return [...reels].sort((a, b) => (sel[sort.key](a) - sel[sort.key](b)) * sort.dir);
  }, [reels, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  const SortHeader = ({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) => (
    <th className={`pb-2 ${className}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-foreground/80">
        {label}
        {sort.key === k ? (sort.dir === -1 ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  );

  return (
    <DashboardLayout active="Reels Studio" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <PageSkeleton stats={4} charts={1} />
      ) : (
        <div className="space-y-6">
          <AnimatedCard>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Reels Studio</h1>
            <p className="mt-1 text-sm text-foreground/55">Watch-rate, hooks and retention — the metrics Instagram actually cares about.</p>
          </AnimatedCard>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(kpis.length
              ? kpis
              : ([
                  { label: "Hook strength", num: null, format: String, sub: "" },
                  { label: "Avg watch time", num: null, format: String, sub: "" },
                  { label: "Avg skip rate", num: null, format: String, sub: "" },
                  { label: "Total plays", num: null, format: String, sub: "" },
                ] as Kpi[])
            ).map((k, i) => (
              <AnimatedCard key={k.label} delay={0.05 * i} className="card-hairline p-5">
                <div className="text-xs uppercase tracking-wider text-foreground/55">{k.label}</div>
                <div className="num mt-2 text-3xl font-semibold">
                  {k.num == null ? "—" : <AnimatedNumber value={k.num} format={k.format} />}
                </div>
                <div className={`mt-1 text-xs ${k.subClass ?? "text-foreground/55"}`}>{k.sub || " "}</div>
              </AnimatedCard>
            ))}
          </div>

          <AnimatedCard delay={0.2} className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Hook strength trend</h2>
            <p className="text-xs text-foreground/55">Weekly average — are your openings getting better?</p>
            <div className="mt-4 h-64">
              {trend.length < 2 ? (
                <CardEmpty label="Not enough weekly Reels history yet — keep posting and Sync." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                    <defs>
                      <linearGradient id="hookGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="hook" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={36} unit="%" />
                    <YAxis yAxisId="watch" orientation="right" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={34} unit="s" />
                    <Tooltip content={<GlassTooltip />} />
                    <Area yAxisId="hook" type="monotone" dataKey="hook" name="Hook %" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#hookGradient)" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
                    <Line yAxisId="watch" type="monotone" dataKey="watch" name="Watch time (s)" stroke="#ec4899" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </AnimatedCard>

          <AnimatedCard delay={0.25} className="card-hairline p-5">
            <h2 className="text-lg font-semibold">Reel performance</h2>
            <p className="text-xs text-foreground/55">Sort by any column · click a reel for full insights</p>
            {sorted.length === 0 ? (
              <CardEmpty label="No Reels analyzed yet — hit Sync to pull retention data from Instagram." />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-[10px] text-foreground/55">
                    <tr>
                      <th className="pb-2 uppercase tracking-wider">Reel</th>
                      <SortHeader label="Hook" k="hook" />
                      <SortHeader label="Watch" k="watch" />
                      <SortHeader label="Skip" k="skip" />
                      <SortHeader label="Plays" k="views" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <motion.tr
                        key={r.ig_media_id}
                        layout
                        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                        onClick={() => setDrawer({ igId: r.ig_media_id, title: r.caption_preview || "Reel", permalink: r.permalink })}
                        className="cursor-pointer border-t border-black/5 transition hover:bg-violet/5"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-3">
                            <ReelThumb igId={r.ig_media_id} />
                            <span className="line-clamp-1 max-w-[260px] font-medium">{r.caption_preview || "Reel"}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`num rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${hookPill(r.hook_strength_pct)}`}>
                            {r.hook_strength_pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="num py-2.5 pr-3">{r.avg_watch_time.toFixed(1)}s</td>
                        <td className="num py-2.5 pr-3">{r.skip_rate.toFixed(1)}%</td>
                        <td className="num py-2.5">{fmt(r.views)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AnimatedCard>

          {sorted.length > 0 && (
            <AnimatedCard delay={0.3} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Top reels</h2>
              <p className="text-xs text-foreground/55">Ranked by hook strength</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {[...reels]
                  .sort((a, b) => b.hook_strength_pct - a.hook_strength_pct)
                  .slice(0, 5)
                  .map((r) => (
                    <ReelCard key={r.ig_media_id} r={r} onOpen={setDrawer} />
                  ))}
              </div>
            </AnimatedCard>
          )}
        </div>
      )}

      <PostInsightsDrawer media={drawer} onClose={() => setDrawer(null)} />
    </DashboardLayout>
  );
}

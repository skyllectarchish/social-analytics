import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { PageSkeleton, Skeleton } from "../components/dashboard/Skeletons";
import PostInsightsDrawer, { type DrawerMedia } from "../components/dashboard/PostInsightsDrawer";
import DrillDown from "../components/charts/DrillDown";
import GlassTooltip from "../components/charts/GlassTooltip";
import { AnimatedCard } from "../components/ui/Motion";
import { useSync } from "../hooks/useSync";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { safeGet } from "../api/client";
import type {
  AlgorithmMetricsResponse,
  AlgorithmPostItem,
  BestTimePost,
  BestTimePostsResponse,
  BestTimeResponse,
  FormatBreakdownPostsResponse,
  FormatBreakdownResponse,
  HashtagComboResponse,
  HashtagsResponse,
} from "../api/types";
import { HEAT_DAYS, HEAT_HOURS, PALETTE_BARS } from "../data/labMock";
import { PALETTE } from "../data/mock";
import { mediaLabel } from "../lib/labels";

const ARC = Math.PI * 70;
const fmtReach = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);

type Tag = { tag: string; reach: string; posts: number; trend: number; up: boolean };
type Format = { format: string; rate: number; productType: string; posts: number };
type HeatCell = { score: number; ratePct: number; n: number };
type Slot = { day: number; bucket: number } | null;
type HeatFormat = "ALL" | "REELS" | "FEED";
const HEAT_FORMATS: { value: HeatFormat; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "REELS", label: "Reels" },
  { value: "FEED", label: "Feed" },
];
type TopPost = { igId: string; caption: string; permalink: string; score: number; reach: string };

function MiniThumb({ igId }: { igId: string }) {
  const src = useAuthedImage(igId);
  return src ? (
    <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-black/5" />
  ) : (
    <div className="bg-lavender h-10 w-10 shrink-0 rounded-lg" />
  );
}

const scorePill = (score: number) =>
  score >= 70
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : score >= 40
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-rose-50 text-rose-600 ring-rose-200";

// Drill level 2: posts of one format ranked by algorithm score.
function FormatPostsList({
  format,
  days,
  onOpen,
}: {
  format: string;
  days: number;
  onOpen: (m: DrawerMedia) => void;
}) {
  const [posts, setPosts] = useState<FormatBreakdownPostsResponse["posts"] | null>(null);

  useEffect(() => {
    let alive = true;
    setPosts(null);
    safeGet<FormatBreakdownPostsResponse>("/instagram/insights/format-breakdown/posts", {
      format,
      days,
      limit: 8,
    }).then((res) => alive && setPosts(res?.posts ?? []));
    return () => {
      alive = false;
    };
  }, [format, days]);

  if (posts === null) {
    return (
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (posts.length === 0) return <CardEmpty label={`No ${mediaLabel(format)} posts in this window.`} />;

  return (
    <div className="mt-3 divide-y divide-black/5">
      {posts.map((p, i) => (
        <button
          key={p.ig_media_id}
          onClick={() => onOpen({ igId: p.ig_media_id, title: p.caption_preview, permalink: p.permalink })}
          className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-violet/5"
        >
          <span className="num w-5 text-xs text-foreground/40">{i + 1}</span>
          <MiniThumb igId={p.ig_media_id} />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-1 text-sm font-medium">{p.caption_preview || "Untitled post"}</span>
            <span className="text-xs text-foreground/55">
              <span className="num">{fmtReach(p.reach)}</span> reach
            </span>
          </span>
          <span className={`num rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scorePill(p.algorithm_score_pct)}`}>
            {Math.round(p.algorithm_score_pct)}
          </span>
        </button>
      ))}
    </div>
  );
}

// Expansion panel under the heatmap: posts published in a clicked 2-hour slot.
function SlotPostsPanel({
  slot,
  days,
  format = "ALL",
  onOpen,
  onClose,
}: {
  slot: { day: number; bucket: number };
  days: number;
  format?: HeatFormat;
  onOpen: (m: DrawerMedia) => void;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<BestTimePost[] | null>(null);
  const hours = [slot.bucket * 2, slot.bucket * 2 + 1];

  useEffect(() => {
    let alive = true;
    setPosts(null);
    Promise.all(
      hours.map((h) =>
        safeGet<BestTimePostsResponse>("/instagram/insights/best-time/posts", {
          day: slot.day + 1, // API: 1=Monday … 7=Sunday
          hour: h,
          days,
        }),
      ),
    ).then((results) => {
      if (!alive) return;
      const seen = new Set<string>();
      const merged = results
        .flatMap((r) => r?.posts ?? [])
        .filter((p) => format === "ALL" || p.media_product_type === format)
        .filter((p) => (seen.has(p.ig_media_id) ? false : (seen.add(p.ig_media_id), true)))
        .sort((a, b) => b.engagement_rate_pct - a.engagement_rate_pct);
      setPosts(merged);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.day, slot.bucket, days, format]);

  return (
    <div className="mt-4 rounded-2xl bg-violet/5 p-4 ring-1 ring-violet/15">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {HEAT_DAYS[slot.day]} · {HEAT_HOURS[slot.bucket]}:00–{slot.bucket * 2 + 2}:00
        </h3>
        <button onClick={onClose} className="rounded-full p-1 text-foreground/50 transition hover:bg-black/5" aria-label="Close slot">
          <X className="h-4 w-4" />
        </button>
      </div>
      {posts === null ? (
        <div className="mt-3 space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/50">No posts published in this slot.</p>
      ) : (
        <div className="mt-2 divide-y divide-black/5">
          {posts.map((p) => (
            <button
              key={p.ig_media_id}
              onClick={() => onOpen({ igId: p.ig_media_id, title: p.caption_preview, permalink: p.permalink })}
              className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-violet/5"
            >
              <MiniThumb igId={p.ig_media_id} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm font-medium">{p.caption_preview || "Untitled post"}</span>
                <span className="text-xs text-foreground/55">
                  {mediaLabel(p.media_product_type)} · <span className="num">{fmtReach(p.reach)}</span> reach
                </span>
              </span>
              <span className="num text-xs font-semibold text-emerald-600">{p.engagement_rate_pct.toFixed(1)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContentLabPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);

  const [score, setScore] = useState<number | null>(null);
  const [stats, setStats] = useState<{ label: string; value: string }[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [btData, setBtData] = useState<BestTimeResponse | null>(null);
  const [heatFormat, setHeatFormat] = useState<HeatFormat>("ALL");
  const [slot, setSlot] = useState<Slot>(null);
  const [formats, setFormats] = useState<Format[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [comboTags, setComboTags] = useState<string[]>([]);
  const [comboMatrix, setComboMatrix] = useState<number[][]>([]);
  const [drawer, setDrawer] = useState<DrawerMedia>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSlot(null);
    (async () => {
      const [bt, fb, am, ht, hc] = await Promise.all([
        // min_sample=1 so any slot with ≥1 post shows (default 3 hides most accounts' data)
        safeGet<BestTimeResponse>("/instagram/insights/best-time", { days, min_sample: 1 }),
        safeGet<FormatBreakdownResponse>("/instagram/insights/format-breakdown", { days }),
        safeGet<AlgorithmMetricsResponse>("/instagram/insights/algorithm-metrics", { days }),
        safeGet<HashtagsResponse>("/instagram/insights/hashtags", { days, limit: 100, min_uses: 1 }),
        safeGet<HashtagComboResponse>("/instagram/insights/hashtags/combos", { days }),
      ]);
      if (!alive) return;

      setBtData(bt?.data.length ? bt : null);

      // Rates arrive as percentages from the API (×100 done in SQL).
      if (fb?.data.length) {
        setFormats(
          fb.data
            .map((d) => ({
              format: mediaLabel(d.media_product_type === "FEED" ? d.media_type : d.media_product_type),
              rate: +d.avg_engagement_rate.toFixed(1),
              productType: d.media_product_type,
              posts: d.post_count,
            }))
            .sort((a, b) => b.rate - a.rate),
        );
      } else setFormats([]);

      if (am?.posts.length) {
        const raw = am.posts.map((p) => p.algorithm_score);
        const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
        setScore(Math.round(Math.min(100, mean)));
        const sm = am.summary;
        setStats([
          { label: "Save rate", value: `${sm.account_save_rate.toFixed(2)}%` },
          { label: "Share rate", value: `${sm.account_share_rate.toFixed(2)}%` },
          { label: "Total reach", value: fmtReach(sm.total_reach) },
        ]);
        setTopPosts(
          [...am.posts]
            .sort((a, b) => b.algorithm_score - a.algorithm_score)
            .slice(0, 5)
            .map((p: AlgorithmPostItem) => ({
              igId: p.ig_media_id,
              caption: p.caption || "Untitled post",
              permalink: p.permalink,
              score: Math.round(p.algorithm_score),
              reach: fmtReach(p.reach),
            })),
        );
      } else {
        setScore(null);
        setStats([]);
        setTopPosts([]);
      }

      if (ht?.data.length) {
        setTags(ht.data.map((h) => ({ tag: h.hashtag.startsWith("#") ? h.hashtag : `#${h.hashtag}`, reach: fmtReach(h.avg_reach), posts: h.post_count, trend: Math.round(h.avg_engagement_rate_pct), up: h.avg_engagement_rate_pct >= 0 })));
      } else setTags([]);

      if (hc?.data.length) {
        const freq = new Map<string, number>();
        for (const c of hc.data) {
          freq.set(c.tag_a, (freq.get(c.tag_a) ?? 0) + c.cooccurrence_count);
          freq.set(c.tag_b, (freq.get(c.tag_b) ?? 0) + c.cooccurrence_count);
        }
        const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
        if (top.length >= 2) {
          const idx = new Map(top.map((t, i) => [t, i]));
          const max = Math.max(...hc.data.map((c) => c.cooccurrence_count), 1);
          const m = top.map(() => top.map(() => 0));
          for (const c of hc.data) {
            const a = idx.get(c.tag_a), b = idx.get(c.tag_b);
            if (a == null || b == null) continue;
            const v = Math.round((c.cooccurrence_count / max) * 95);
            m[a][b] = v; m[b][a] = v;
          }
          setComboTags(top.map((t) => (t.startsWith("#") ? t : `#${t}`)));
          setComboMatrix(m);
        } else { setComboTags([]); setComboMatrix([]); }
      } else { setComboTags([]); setComboMatrix([]); }

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days]);

  // Heatmap grid for the selected format filter. Recomputed client-side from
  // the single best-time response (data = all formats, by_format = split).
  const { heat, hotCells } = useMemo(() => {
    const slots =
      heatFormat === "ALL"
        ? btData?.data
        : btData?.by_format.filter((s) => s.media_product_type === heatFormat);
    if (!slots?.length) return { heat: null as HeatCell[][] | null, hotCells: new Set<string>() };

    const max = Math.max(...slots.map((s) => s.avg_engagement_rate), 0.0001);
    const grid: HeatCell[][] = HEAT_DAYS.map(() => HEAT_HOURS.map(() => ({ score: 0, ratePct: 0, n: 0 })));
    for (const s of slots) {
      const r = s.day_of_week - 1;
      const c = Math.min(11, Math.floor(s.hour_of_day / 2));
      if (r < 0 || r > 6) continue;
      const cell = grid[r][c];
      cell.score = Math.max(cell.score, 22 + Math.round((s.avg_engagement_rate / max) * 77));
      cell.ratePct = Math.max(cell.ratePct, +s.avg_engagement_rate.toFixed(2));
      cell.n += s.sample_size;
    }
    // Top 3 "sweet spots" get a pulse ring.
    const ranked = grid
      .flatMap((row, d) => row.map((cell, i) => ({ d, i, rate: cell.ratePct, n: cell.n })))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);
    return { heat: grid, hotCells: new Set(ranked.map((c) => `${c.d}:${c.i}`)) };
  }, [btData, heatFormat]);

  return (
    <DashboardLayout active="Content Lab" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <PageSkeleton stats={0} charts={2} />
      ) : (
        <div className="space-y-6">
          <AnimatedCard>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Content Lab</h1>
            <p className="mt-1 text-sm text-foreground/55">Understand the why behind every post.</p>
          </AnimatedCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <AnimatedCard delay={0.05} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Algorithm score</h2>
              <p className="text-xs text-foreground/55">Mean of your recent posts</p>
              {score == null ? (
                <CardEmpty label="No scored posts yet — Sync to analyze." />
              ) : (
                <>
                  <div className="mt-4 grid place-items-center">
                    <svg viewBox="0 0 180 110" className="w-full max-w-[180px]" role="img" aria-label={`Algorithm score ${score}`}>
                      <defs>
                        <linearGradient id="gg" x1="0" x2="1"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="50%" stopColor="#ec4899" /><stop offset="100%" stopColor="#f97316" /></linearGradient>
                      </defs>
                      <path d="M 20 100 A 70 70 0 0 1 160 100" stroke="#ede9fe" strokeWidth="14" fill="none" strokeLinecap="round" />
                      <path d="M 20 100 A 70 70 0 0 1 160 100" stroke="url(#gg)" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={ARC} strokeDashoffset={ARC * (1 - score / 100)} />
                      <text x="90" y="92" textAnchor="middle" className="num" fontSize="32" fontWeight="700" fill="#0a0e27">{score}</text>
                      <text x="90" y="105" textAnchor="middle" fontSize="9" fill="#0a0e2780">ALGO SCORE</text>
                    </svg>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    {stats.map((s) => (
                      <div key={s.label} className="flex justify-between">
                        <span>{s.label}</span>
                        <span className="num font-semibold text-violet-deep">{s.value}</span>
                      </div>
                    ))}
                  </div>
                  {topPosts.length > 0 && (
                    <div className="mt-4 border-t border-black/5 pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/55">Top posts by score</h3>
                      <div className="mt-1 divide-y divide-black/5">
                        {topPosts.map((p) => (
                          <button
                            key={p.igId}
                            onClick={() => setDrawer({ igId: p.igId, title: p.caption, permalink: p.permalink })}
                            className="flex w-full items-center gap-2.5 py-2 text-left transition hover:bg-violet/5"
                          >
                            <MiniThumb igId={p.igId} />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-1 text-xs font-medium">{p.caption}</span>
                              <span className="num text-[10px] text-foreground/55">{p.reach} reach</span>
                            </span>
                            <span className={`num rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${scorePill(p.score)}`}>{p.score}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </AnimatedCard>

            <AnimatedCard delay={0.1} className="card-hairline p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Best time to post</h2>
                  <p className="text-xs text-foreground/55">Engagement by day × hour — click a cell to see its posts</p>
                </div>
                <div className="flex gap-1 rounded-full bg-black/5 p-0.5">
                  {HEAT_FORMATS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => { setHeatFormat(f.value); setSlot(null); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        heatFormat === f.value
                          ? "bg-white text-violet-deep shadow-sm ring-1 ring-violet/20"
                          : "text-foreground/60 hover:text-foreground/90"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {!heat ? (
                <CardEmpty
                  label={
                    heatFormat === "ALL"
                      ? "No posting history yet — Sync to build your heatmap."
                      : `No ${heatFormat === "REELS" ? "Reels" : "feed"} posts in this window.`
                  }
                />
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto">
                    <div className="min-w-[480px] max-w-[680px]">
                      <div className="mb-1 grid grid-cols-[40px_repeat(12,1fr)] gap-1 text-[10px] text-foreground/55">
                        <div />
                        {HEAT_HOURS.map((h) => <div key={h} className="text-center">{h}</div>)}
                      </div>
                      {heat.map((row, d) => (
                        <div key={d} className="mb-1 grid grid-cols-[40px_repeat(12,1fr)] gap-1">
                          <div className="text-xs text-foreground/70">{HEAT_DAYS[d]}</div>
                          {row.map((cell, i) => (
                            <div key={i} className="group relative">
                              <button
                                onClick={() => cell.n > 0 && setSlot({ day: d, bucket: i })}
                                aria-label={`${HEAT_DAYS[d]} ${HEAT_HOURS[i]}:00 — ${cell.n} posts`}
                                className={`block aspect-square w-full rounded-md transition ${
                                  cell.n > 0 ? "cursor-pointer hover:ring-2 hover:ring-violet/50" : "cursor-default"
                                } ${slot && slot.day === d && slot.bucket === i ? "ring-2 ring-violet" : ""}`}
                                style={{
                                  background: cell.score === 0 ? "#f1f2f7" : `linear-gradient(135deg, rgba(139,92,246,${(cell.score / 110).toFixed(3)}), rgba(236,72,153,${(cell.score / 130).toFixed(3)}))`,
                                  ...(hotCells.has(`${d}:${i}`) ? { animation: "pulseSoft 2.4s ease-in-out infinite" } : {}),
                                }}
                              />
                              {cell.n > 0 && (
                                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[10px] text-white shadow-lg group-hover:block">
                                  <div className="font-semibold">{HEAT_DAYS[d]} {HEAT_HOURS[i]}:00–{i * 2 + 2}:00</div>
                                  <div className="num">{cell.ratePct}% eng · {cell.n} post{cell.n === 1 ? "" : "s"}</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  {slot && <SlotPostsPanel slot={slot} days={days} format={heatFormat} onOpen={setDrawer} onClose={() => setSlot(null)} />}
                </>
              )}
            </AnimatedCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatedCard delay={0.15}>
              <DrillDown<string>
                title="Format breakdown"
                subtitle="Engagement rate by format — click a bar to drill in"
                levels={["By format", "Top posts"]}
                className="h-full"
              >
                {(state, drill) =>
                  state.level === 0 ? (
                    <div className="mt-4 h-64">
                      {formats.length === 0 ? (
                        <CardEmpty label="No posts in this window yet." />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={formats} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                            <XAxis dataKey="format" tick={{ fontSize: 11, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={36} unit="%" />
                            <Tooltip cursor={{ fill: "rgba(139,92,246,0.06)" }} content={<GlassTooltip unit="%" />} />
                            <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
                              {formats.map((f, i) => (
                                <Cell
                                  key={i}
                                  fill={PALETTE_BARS[i % PALETTE_BARS.length]}
                                  cursor="pointer"
                                  onClick={() => drill(f.productType)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  ) : (
                    <FormatPostsList format={state.context ?? "FEED"} days={days} onOpen={setDrawer} />
                  )
                }
              </DrillDown>
            </AnimatedCard>

            <AnimatedCard delay={0.2} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Hashtag performance</h2>
              <p className="text-xs text-foreground/55">All tags in this window</p>
              {tags.length === 0 ? (
                <CardEmpty label="No hashtag data yet." />
              ) : (
                <div className="mt-3 max-h-72 overflow-y-auto pr-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 text-left text-[10px] uppercase tracking-wider text-foreground/55">
                      <tr>
                        <th className="bg-white pb-2 pt-1">Tag</th>
                        <th className="bg-white pb-2 pt-1">Reach</th>
                        <th className="bg-white pb-2 pt-1">Posts</th>
                        <th className="bg-white pb-2 pt-1">Eng.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((h) => (
                        <tr key={h.tag} className="border-t border-black/5">
                          <td className="py-2.5 font-medium text-violet-deep">{h.tag}</td>
                          <td className="num py-2.5">{h.reach}</td>
                          <td className="num py-2.5">{h.posts}</td>
                          <td className="num py-2.5 font-medium text-emerald-600">{h.trend}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AnimatedCard>

            <AnimatedCard delay={0.25} className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Hashtag combo heatmap</h2>
              <p className="text-xs text-foreground/55">Co-occurrence strength of your top tags</p>
              {comboMatrix.length < 2 ? (
                <CardEmpty label="Not enough tag co-occurrence yet." />
              ) : (
                <div className="mt-4">
                  <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] gap-1 text-[9px]">
                    <div />
                    {comboTags.map((t) => <div key={t} className="truncate text-center text-foreground/55">{t}</div>)}
                    {comboMatrix.map((row, r) => <FragmentRow key={r} label={comboTags[r]} row={row} tags={comboTags} />)}
                  </div>
                </div>
              )}
            </AnimatedCard>
          </div>
        </div>
      )}

      <PostInsightsDrawer media={drawer} onClose={() => setDrawer(null)} />
    </DashboardLayout>
  );
}

function FragmentRow({ label, row, tags }: { label: string; row: number[]; tags: string[] }) {
  return (
    <>
      <div className="truncate py-1 text-foreground/70">{label}</div>
      {row.map((score, c) => (
        <div key={c} className="aspect-square rounded" title={`${label} × ${tags[c]} · ${score}`}
          style={{ background: score === 0 ? "#f1f2f7" : `rgba(139,92,246,${(score / 120 + 0.2).toFixed(3)})` }} />
      ))}
    </>
  );
}

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty, PageLoading } from "../components/dashboard/States";
import GlassTooltip from "../components/charts/GlassTooltip";
import { useSync } from "../hooks/useSync";
import { safeGet } from "../api/client";
import type {
  AlgorithmMetricsResponse,
  BestTimeResponse,
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

export default function ContentLabPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);

  const [score, setScore] = useState<number | null>(null);
  const [stats, setStats] = useState<{ label: string; value: string }[]>([]);
  const [heat, setHeat] = useState<number[][] | null>(null);
  const [formats, setFormats] = useState<{ format: string; rate: number }[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [comboTags, setComboTags] = useState<string[]>([]);
  const [comboMatrix, setComboMatrix] = useState<number[][]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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

      if (bt?.data.length) {
        const max = Math.max(...bt.data.map((s) => s.avg_engagement_rate), 0.0001);
        const grid = HEAT_DAYS.map(() => HEAT_HOURS.map(() => 0));
        for (const s of bt.data) {
          const r = s.day_of_week - 1;
          const c = Math.min(11, Math.floor(s.hour_of_day / 2));
          if (r < 0 || r > 6) continue;
          grid[r][c] = Math.max(grid[r][c], 22 + Math.round((s.avg_engagement_rate / max) * 77));
        }
        setHeat(grid);
      } else setHeat(null);

      if (fb?.data.length) {
        const scale = Math.max(...fb.data.map((d) => d.avg_engagement_rate)) <= 1 ? 100 : 1;
        setFormats(fb.data.map((d) => ({ format: mediaLabel(d.media_product_type === "FEED" ? d.media_type : d.media_product_type), rate: +(d.avg_engagement_rate * scale).toFixed(1) })).sort((a, b) => b.rate - a.rate));
      } else setFormats([]);

      if (am?.posts.length) {
        const raw = am.posts.map((p) => p.algorithm_score);
        const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
        setScore(Math.round(mean <= 1 ? mean * 100 : Math.min(100, mean)));
        const sm = am.summary;
        const rScale = sm.account_save_rate <= 1 && sm.account_share_rate <= 1 ? 100 : 1;
        setStats([
          { label: "Save rate", value: `${(sm.account_save_rate * rScale).toFixed(2)}%` },
          { label: "Share rate", value: `${(sm.account_share_rate * rScale).toFixed(2)}%` },
          { label: "Total reach", value: fmtReach(sm.total_reach) },
        ]);
      } else {
        setScore(null);
        setStats([]);
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

  return (
    <DashboardLayout active="Content Lab" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Content Lab</h1>
            <p className="mt-1 text-sm text-foreground/55">Understand the why behind every post.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card-hairline p-5">
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
                </>
              )}
            </div>

            <div className="card-hairline p-5 lg:col-span-2">
              <h2 className="text-lg font-semibold">Best time to post</h2>
              <p className="text-xs text-foreground/55">Engagement by day × hour</p>
              {!heat ? (
                <CardEmpty label="No posting history yet — Sync to build your heatmap." />
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[480px] max-w-[680px]">
                    <div className="mb-1 grid grid-cols-[40px_repeat(12,1fr)] gap-1 text-[10px] text-foreground/55">
                      <div />
                      {HEAT_HOURS.map((h) => <div key={h} className="text-center">{h}</div>)}
                    </div>
                    {heat.map((row, d) => (
                      <div key={d} className="mb-1 grid grid-cols-[40px_repeat(12,1fr)] gap-1">
                        <div className="text-xs text-foreground/70">{HEAT_DAYS[d]}</div>
                        {row.map((sc, i) => (
                          <div key={i} className="aspect-square rounded-md" title={`${HEAT_DAYS[d]} ${HEAT_HOURS[i]}:00 · ${sc}`}
                            style={{ background: sc === 0 ? "#f1f2f7" : `linear-gradient(135deg, rgba(139,92,246,${(sc / 110).toFixed(3)}), rgba(236,72,153,${(sc / 130).toFixed(3)}))` }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Format breakdown</h2>
              <p className="text-xs text-foreground/55">Engagement rate by format</p>
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
                        {formats.map((_, i) => <Cell key={i} fill={PALETTE_BARS[i % PALETTE_BARS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card-hairline p-5">
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
            </div>

            <div className="card-hairline p-5">
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
          </div>
          </div>
        </div>
      )}
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

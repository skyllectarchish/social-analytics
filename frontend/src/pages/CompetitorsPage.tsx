import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { ListSkeleton } from "../components/dashboard/Skeletons";
import { useSync } from "../hooks/useSync";
import api, { errorMessage, safeGet } from "../api/client";
import type {
  CompetitorListResponse, CompetitorLookupPreview, CompetitorTimelineResponse, ContentMixResponse,
} from "../api/types";
import { PALETTE } from "../data/mock";

const COLORS = ["#ec4899", "#f97316", "#60a5fa", "#10b981", "#a78bfa", "#8b5cf6"];
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const STALE_THRESHOLD = 3; // mirrors backend auto-remove threshold
type Row = { handle: string; raw?: string; followers: string; eng: string; reels: number; you: boolean; failures: number };
type MixRow = { name: string; Reels: number; Posts: number; Photo: number };
type LookupState =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "searching" }
  | { kind: "found"; preview: CompetitorLookupPreview }
  | { kind: "not_found" };

const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

export default function CompetitorsPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState<Row[]>([]);
  const [growth, setGrowth] = useState<Record<string, number | string>[]>([]);
  const [lines, setLines] = useState<{ key: string; color: string }[]>([]);
  const [mix, setMix] = useState<MixRow[]>([]);

  // add-competitor form with live Instagram lookup
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const lookupTimer = useRef<number | undefined>(undefined);

  // Debounced live lookup: validates the handle exists and is a public
  // Business/Creator account before the Add button arms.
  useEffect(() => {
    window.clearTimeout(lookupTimer.current);
    const clean = handle.trim().replace(/^@+/, "").toLowerCase();
    if (!clean) { setLookup({ kind: "idle" }); return; }
    if (!HANDLE_RE.test(clean)) { setLookup({ kind: "invalid" }); return; }
    setLookup({ kind: "searching" });
    lookupTimer.current = window.setTimeout(async () => {
      const preview = await safeGet<CompetitorLookupPreview>("/instagram/competitors/lookup", { handle: clean });
      setLookup(preview ? { kind: "found", preview } : { kind: "not_found" });
    }, 450);
    return () => window.clearTimeout(lookupTimer.current);
  }, [handle]);

  const load = useCallback(async () => {
    const [list, tl, cm] = await Promise.all([
      safeGet<CompetitorListResponse>("/instagram/competitors"),
      safeGet<CompetitorTimelineResponse>("/instagram/competitors/timeline", { days: 365 }),
      safeGet<ContentMixResponse>("/instagram/competitors/content-mix", { days: 90 }),
    ]);

    if (list?.competitors.length || list?.you) {
      const r: Row[] = (list.competitors ?? []).map((c) => ({
        handle: c.handle.startsWith("@") ? c.handle : `@${c.handle}`,
        raw: c.handle,
        followers: c.latest_snapshot ? c.latest_snapshot.followers_count.toLocaleString() : "—",
        eng: c.latest_snapshot ? `${c.latest_snapshot.avg_engagement_rate_pct.toFixed(1)}%` : "—",
        reels: c.latest_snapshot?.reels_last_7d ?? 0,
        you: false,
        failures: c.consecutive_failures ?? 0,
      }));
      if (list.you) r.push({ handle: "@you", followers: list.you.followers_count.toLocaleString(), eng: `${list.you.avg_engagement_rate_pct.toFixed(1)}%`, reels: list.you.reels_last_7d, you: true, failures: 0 });
      setRows(r);
    } else setRows([]);

    if (tl?.series.length) {
      const byDate = new Map<string, Record<string, number | string>>();
      for (const s of tl.series) {
        for (const p of s.points) {
          const row = byDate.get(p.date) ?? { m: p.date.slice(5) };
          row[s.handle] = +(p.followers / 1000).toFixed(1);
          byDate.set(p.date, row);
        }
      }
      setGrowth([...byDate.values()]);
      setLines(tl.series.map((s, i) => ({ key: s.handle, color: COLORS[i % COLORS.length] })));
    } else { setGrowth([]); setLines([]); }

    if (cm?.accounts.length) {
      setMix(cm.accounts.map((a) => ({ name: (a.display_name || a.handle).replace(/^@/, ""), Reels: Math.round(a.mix.reels), Posts: Math.round(a.mix.carousel), Photo: Math.round(a.mix.image) })));
    } else setMix([]);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, days]);

  async function addCompetitor(e: FormEvent) {
    e.preventDefault();
    if (lookup.kind !== "found" || adding) return;
    setAdding(true);
    setFormError(null);
    try {
      await api.post("/instagram/competitors", { handle: lookup.preview.handle });
      setHandle("");
      setLookup({ kind: "idle" });
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Could not add that handle"));
    } finally {
      setAdding(false);
    }
  }

  async function removeCompetitor(raw: string) {
    setFormError(null);
    try {
      await api.delete(`/instagram/competitors/${encodeURIComponent(raw)}`);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Could not remove competitor"));
    }
  }

  return (
    <DashboardLayout active="Competitors" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {loading ? (
        <ListSkeleton rows={5} />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Competitor radar</h1>
            <p className="mt-1 text-sm text-foreground/55">Side-by-side tracking · refreshed every 6 hours</p>
          </div>

          <div className="card-hairline p-5">
            {/* add-competitor form */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Tracked accounts</h2>
              <form onSubmit={addCompetitor} className="flex items-center gap-2">
                <div className="flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm transition focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/30">
                  <span className="text-foreground/40">@</span>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="add a competitor handle"
                    aria-label="Competitor handle"
                    className="w-36 bg-transparent px-1 outline-none placeholder:text-foreground/40 sm:w-44"
                  />
                  <span className="ml-1" aria-hidden>
                    {lookup.kind === "searching" && <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />}
                    {lookup.kind === "found" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {(lookup.kind === "not_found" || lookup.kind === "invalid") && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                  </span>
                </div>
                <button type="submit" disabled={adding || lookup.kind !== "found"} className="btn-glow !px-4 !py-2 text-sm disabled:opacity-60">
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {lookup.kind === "found" ? `Track @${lookup.preview.username}` : "Add"}
                </button>
              </form>
            </div>

            {/* live lookup feedback */}
            {lookup.kind === "invalid" && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Use letters, numbers, dots, or underscores (max 30 chars).
              </p>
            )}
            {lookup.kind === "not_found" && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Not found on Instagram, or not a public Business/Creator account.
              </p>
            )}
            {lookup.kind === "found" && (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-emerald-50/70 px-3 py-2.5 ring-1 ring-emerald-200">
                {lookup.preview.profile_picture_url ? (
                  <img src={lookup.preview.profile_picture_url} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <span className="bg-lavender grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-violet-deep">
                    {lookup.preview.username.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <div className="truncate font-semibold">
                    {lookup.preview.display_name || `@${lookup.preview.username}`}
                    <span className="ml-1.5 font-normal text-foreground/55">@{lookup.preview.username}</span>
                  </div>
                  <div className="num text-foreground/60">
                    {fmtK(lookup.preview.followers_count)} followers · {lookup.preview.media_count} posts
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              </div>
            )}

            {formError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{formError}</p>
            )}

            {rows.length === 0 ? (
              <CardEmpty label="No accounts tracked yet — add a competitor handle above to benchmark against." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-foreground/55">
                    <tr>
                      <th className="pb-2">Account</th>
                      <th className="pb-2">Followers</th>
                      <th className="pb-2">Engagement</th>
                      <th className="pb-2">Reels / 7d</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.handle} className={`border-t border-black/5 ${c.you ? "bg-lavender/40" : ""}`}>
                        <td className="py-3 font-medium">
                          {c.handle}
                          {c.you && <span className="chip ml-2 !bg-ink !py-0 !text-white">you</span>}
                          {c.failures >= 1 && (
                            <span
                              className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 ring-1 ring-amber-200"
                              title={`Last ${c.failures} daily sync${c.failures === 1 ? "" : "s"} failed — data may be stale. Auto-removed after ${STALE_THRESHOLD}.`}
                            >
                              stale {c.failures}/{STALE_THRESHOLD}
                            </span>
                          )}
                        </td>
                        <td className="num py-3">{c.followers}</td>
                        <td className="num py-3">{c.eng}</td>
                        <td className="num py-3">{c.reels}</td>
                        <td className="py-3 text-right">
                          {!c.you && c.raw && (
                            <button
                              onClick={() => removeCompetitor(c.raw!)}
                              aria-label={`Remove ${c.handle}`}
                              className="rounded-lg p-1.5 text-foreground/40 transition hover:bg-black/5 hover:text-red-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Follower growth</h2>
              <div className="mt-4 h-72">
                {growth.length === 0 ? <CardEmpty label="No competitor timeline yet — add accounts and let the daily sync build history." /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={growth} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                      <XAxis dataKey="m" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={36} unit="K" />
                      <Tooltip cursor={{ stroke: PALETTE.violet, strokeWidth: 1 }} contentStyle={{ borderRadius: 12, border: "1px solid rgba(15,17,40,0.08)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={l.key === "you" ? 3 : 2} dot={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card-hairline p-5">
              <h2 className="text-lg font-semibold">Content mix</h2>
              <div className="mt-4 h-72">
                {mix.length === 0 ? <CardEmpty label="No content-mix data yet." /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mix} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip cursor={{ fill: "rgba(139,92,246,0.06)" }} contentStyle={{ borderRadius: 12, border: "1px solid rgba(15,17,40,0.08)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Reels" stackId="a" fill="#8b5cf6" />
                      <Bar dataKey="Posts" stackId="a" fill="#ec4899" />
                      <Bar dataKey="Photo" stackId="a" fill="#f97316" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

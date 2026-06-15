import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, FileUp, Loader2, Upload } from "lucide-react";
import api, { errorMessage, safeGet } from "../api/client";
import type { ArchiveImportResponse, ArchiveSummaryResponse } from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import GlassTooltip from "../components/charts/GlassTooltip";
import { PALETTE } from "../data/mock";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

const STEPS = [
  "On Instagram: Settings → Accounts Center → Your information and permissions → Download your information",
  "Choose your Instagram account → \"All time\" date range → format JSON (not HTML)",
  "Instagram emails you a ZIP within a few minutes to a few hours",
  "Drop the ZIP here (or just the JSON files if the ZIP is huge)",
];

export default function ImportPage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<ArchiveSummaryResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ArchiveImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSummary = useCallback(async () => {
    const s = await safeGet<ArchiveSummaryResponse>("/instagram/import/summary");
    setSummary(s);
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const { data } = await api.post<ArchiveImportResponse>("/instagram/import/archive", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      await loadSummary();
    } catch (err) {
      setError(errorMessage(err, "Import failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function sync() {
    // The header Sync button isn't really meaningful here; refresh the summary.
    setSyncing(true);
    await loadSummary();
    setSyncing(false);
  }

  const hasData = summary && (summary.posts > 0 || summary.stories > 0 || summary.followers > 0);

  return (
    <DashboardLayout active="Posts" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Import your archive{" "}
            <span className="font-serif font-normal italic text-foreground/60">
              — history Meta's API can't give you.
            </span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            Upload your official Instagram data export to unlock your complete story archive,
            every post ever made, and your true follower growth curve with exact follow dates.
          </p>
        </div>

        {/* how-to + upload */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-hairline p-5">
            <h2 className="text-lg font-semibold">How to get your export</h2>
            <ol className="mt-3 space-y-2.5">
              {STEPS.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-foreground/70">
                  <span className="bg-lavender text-violet-deep grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="card-hairline flex flex-col p-5">
            <h2 className="text-lg font-semibold">Upload</h2>
            <label
              className={`mt-3 flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet/25 bg-lavender/30 p-6 text-center transition hover:bg-lavender/60 ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".zip,.json,application/zip,application/json"
                className="hidden"
                onChange={(e) => upload(e.target.files)}
              />
              {uploading ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-violet" />
                  <span className="text-sm font-medium">Parsing your archive…</span>
                </>
              ) : (
                <>
                  <span className="bg-ig grid h-11 w-11 place-items-center rounded-2xl text-white">
                    <FileUp className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Click to choose the export ZIP</span>
                  <span className="text-xs text-foreground/50">
                    or individual JSON files · media inside the ZIP is never read or stored
                  </span>
                </>
              )}
            </label>
            {result && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                Imported {result.posts_imported} posts, {result.stories_imported} stories,{" "}
                {result.followers_imported} followers.
              </p>
            )}
            {result && result.files.length > 0 && (
              <details className="mt-2 rounded-lg bg-foreground/[0.03] px-3 py-2 text-xs" open={result.stories_imported === 0}>
                <summary className="cursor-pointer font-medium text-foreground/70">
                  Per-file breakdown ({result.files.length})
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-foreground/65">
                  {result.files.map((f, i) => {
                    const looksStory = /stor(y|ies)/i.test(f.file);
                    const misrouted = looksStory && f.kind !== "stories";
                    return (
                      <li
                        key={`${f.file}-${i}`}
                        className={`flex items-center justify-between gap-3 ${misrouted ? "text-amber-600" : ""}`}
                      >
                        <span className="truncate">{f.file}</span>
                        <span className="shrink-0">
                          {f.kind} · {f.rows}
                          {misrouted ? " ⚠" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
            )}
          </div>
        </div>

        {/* recovered history */}
        {hasData && summary && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Archive posts", value: summary.posts, from: summary.posts_from },
                { label: "Archived stories", value: summary.stories, from: summary.stories_from },
                { label: "Followers with join dates", value: summary.followers, from: summary.followers_from },
              ].map((s) => (
                <div key={s.label} className="card-hairline p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-foreground/55">{s.label}</div>
                  <div className="num mt-2 text-3xl font-semibold">{fmt(s.value)}</div>
                  <div className="mt-1 text-xs text-foreground/50">
                    {s.from ? `since ${new Date(s.from).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "—"}
                  </div>
                </div>
              ))}
            </div>

            {summary.follower_growth.length > 1 && (
              <div className="card-hairline p-5">
                <h2 className="text-lg font-semibold">True follower growth</h2>
                <p className="text-xs text-foreground/55">
                  From exact follow timestamps in your export — bars are monthly joins, the line is your cumulative audience.
                </p>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={summary.follower_growth.map((p) => ({ ...p, label: monthLabel(p.month) }))}
                      margin={{ top: 8, right: 6, bottom: 0, left: -8 }}
                    >
                      <defs>
                        <linearGradient id="archGrowthFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PALETTE.violet} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={PALETTE.violet} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis yAxisId="joins" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => fmt(v as number)} />
                      <YAxis yAxisId="cum" orientation="right" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip content={<GlassTooltip />} />
                      <Bar yAxisId="joins" dataKey="joins" name="New followers" fill={PALETTE.pink} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      <Area yAxisId="cum" type="monotone" dataKey="cumulative" name="Total followers" stroke={PALETTE.violet} strokeWidth={2.5} fill="url(#archGrowthFill)" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {summary.content_by_month.length > 1 && (
              <div className="card-hairline p-5">
                <h2 className="text-lg font-semibold">Content output over time</h2>
                <p className="text-xs text-foreground/55">Posts and stories per month, from your full archive.</p>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={summary.content_by_month.map((p) => ({ ...p, label: monthLabel(p.month) }))}
                      margin={{ top: 8, right: 6, bottom: 0, left: -14 }}
                    >
                      <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => fmt(v as number)} />
                      <Tooltip content={<GlassTooltip />} />
                      <Bar dataKey="posts" name="Posts" fill={PALETTE.violet} radius={[4, 4, 0, 0]} maxBarSize={14} />
                      <Bar dataKey="stories" name="Stories" fill={PALETTE.blue} radius={[4, 4, 0, 0]} maxBarSize={14} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}

        {!hasData && (
          <div className="card-hairline flex items-center gap-3 p-5 text-sm text-foreground/55">
            <Upload className="h-4 w-4 shrink-0 text-violet" />
            Nothing imported yet — once you upload your export, your recovered history appears here.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

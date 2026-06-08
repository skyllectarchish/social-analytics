import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Download, Eye, Heart, Loader2, Printer, Sparkles } from "lucide-react";
import api, { errorMessage, safeGet } from "../api/client";
import type {
  DashboardSummary,
  DemographicResponse,
  InstagramProfile,
} from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { mediaLabel } from "../lib/labels";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { avatar } from "../data/mock";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

function KitThumb({ id }: { id: string }) {
  const src = useAuthedImage(id);
  if (!src) return <div className="bg-lavender h-full w-full" aria-hidden />;
  return <img src={src} alt="" className="h-full w-full object-cover" />;
}

// Horizontal percentage bar used by the age + country breakdowns.
function PctBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 truncate text-foreground/60">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-lavender">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-violet to-pink-500"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="num w-9 shrink-0 text-right font-semibold">{pct}%</span>
    </div>
  );
}

export default function MediaKitPage() {
  const navigate = useNavigate();
  // 90 days reads as "recent track record" to sponsors — wider than the
  // dashboard's 30-day default, still inside Meta's insights retention.
  const [days, setDays] = useState(90);
  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [ageDemo, setAgeDemo] = useState<DemographicResponse | null>(null);
  const [genderDemo, setGenderDemo] = useState<DemographicResponse | null>(null);
  const [countryDemo, setCountryDemo] = useState<DemographicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: prof } = await api.get<InstagramProfile>("/instagram/profile");
      setProfile(prof);
      const [sum, age, gender, country] = await Promise.all([
        api.get<DashboardSummary>("/instagram/insights/dashboard", { params: { days, top_n: 6 } }),
        // Demographics are optional — small accounts fall below Meta's privacy threshold.
        safeGet<DemographicResponse>("/instagram/insights/demographics", { metric: "follower_demographics", breakdown: "age" }),
        safeGet<DemographicResponse>("/instagram/insights/demographics", { metric: "follower_demographics", breakdown: "gender" }),
        safeGet<DemographicResponse>("/instagram/insights/demographics", { metric: "follower_demographics", breakdown: "country" }),
      ]);
      setSummary(sum.data);
      setAgeDemo(age);
      setGenderDemo(gender);
      setCountryDemo(country);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        navigate("/connect", { replace: true });
        return;
      }
      setError(errorMessage(err, "Could not load your media kit"));
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

  const engagement =
    summary && summary.total_reach > 0
      ? (summary.total_interactions / summary.total_reach) * 100
      : 0;

  const topPct = (demo: DemographicResponse | null, n: number) => {
    const data = demo?.data ?? [];
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return [];
    return data
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, n)
      .map((d) => ({ label: d.dimension_value, pct: Math.round((d.value / total) * 100) }));
  };
  const ageBars = topPct(ageDemo, 5);
  const countryBars = topPct(countryDemo, 5);
  const genderBars = topPct(genderDemo, 3).map((g) => ({
    ...g,
    label: g.label.toUpperCase().startsWith("F") ? "Female" : g.label.toUpperCase().startsWith("M") ? "Male" : "Other",
  }));

  function exportCsv() {
    if (!profile || !summary) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: (string | number)[][] = [
      ["Media kit", `@${profile.username}`],
      ["Generated", new Date().toISOString().slice(0, 10)],
      ["Window (days)", summary.period_days],
      [],
      ["Metric", "Value"],
      ["Followers", profile.followers_count],
      ["Posts", profile.media_count],
      ["Engagement rate (%)", engagement.toFixed(2)],
      ["Total reach", summary.total_reach],
      ["Total views", summary.total_views],
      ["Total interactions", summary.total_interactions],
      ["Net follower growth", summary.net_follower_growth],
      [],
      ["Top posts"],
      ["Permalink", "Type", "Caption", "Views", "Interactions"],
      ...summary.top_posts.map((p) => [
        p.permalink, mediaLabel(p.media_type), p.caption.slice(0, 120), p.views, p.interactions,
      ]),
    ];
    const csv = lines.map((row) => row.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `media-kit-${profile.username}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ backgroundColor: "#F5F6FA" }}>
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  const stats = [
    { label: "Followers", value: profile ? fmt(profile.followers_count) : "—" },
    { label: "Engagement rate", value: `${engagement.toFixed(2)}%` },
    { label: "Reach", value: summary ? fmt(summary.total_reach) : "—" },
    { label: "Views", value: summary ? fmt(summary.total_views) : "—" },
    { label: "Interactions", value: summary ? fmt(summary.total_interactions) : "—" },
    {
      label: "New followers",
      value: summary
        ? `${summary.net_follower_growth >= 0 ? "+" : ""}${fmt(summary.net_follower_growth)}`
        : "—",
    },
  ];

  return (
    <DashboardLayout active="Media Kit" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="mx-auto max-w-4xl space-y-6">
        {error && (
          <p className="no-print rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        {/* actions */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Media kit</h1>
            <p className="mt-1 text-sm text-foreground/55">
              A shareable one-pager for brand partners — print to PDF or export the numbers.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="chip cursor-pointer">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={() => window.print()} className="btn-glow !px-4 !py-2 text-sm">
              <Printer className="h-4 w-4" /> Download PDF
            </button>
          </div>
        </div>

        {/* the kit */}
        <div className="card-hairline overflow-hidden bg-white">
          {/* header band */}
          <div className="bg-ig p-6 text-white">
            <div className="flex items-center gap-4">
              <img
                src={profile?.profile_picture_url || avatar(47)}
                alt=""
                className="h-20 w-20 rounded-full object-cover ring-4 ring-white/40"
              />
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  {profile?.name || profile?.username}
                </h2>
                <p className="text-sm text-white/85">
                  instagram.com/{profile?.username} · {profile ? fmt(profile.media_count) : "—"} posts
                </p>
                {profile?.biography && (
                  <p className="mt-1 line-clamp-2 text-xs text-white/75">{profile.biography}</p>
                )}
              </div>
            </div>
          </div>

          {/* stat grid */}
          <div className="grid grid-cols-2 gap-px bg-black/5 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((s) => (
              <div key={s.label} className="bg-white p-4 text-center">
                <div className="num text-xl font-semibold">{s.value}</div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground/50">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* audience */}
          {(ageBars.length > 0 || genderBars.length > 0 || countryBars.length > 0) && (
            <div className="grid gap-6 border-t border-black/5 p-6 sm:grid-cols-3">
              {ageBars.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Audience age</h3>
                  <div className="mt-3 space-y-2">
                    {ageBars.map((b) => <PctBar key={b.label} label={b.label} pct={b.pct} />)}
                  </div>
                </div>
              )}
              {genderBars.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Gender</h3>
                  <div className="mt-3 space-y-2">
                    {genderBars.map((b) => <PctBar key={b.label} label={b.label} pct={b.pct} />)}
                  </div>
                </div>
              )}
              {countryBars.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Top countries</h3>
                  <div className="mt-3 space-y-2">
                    {countryBars.map((b) => <PctBar key={b.label} label={b.label} pct={b.pct} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* top posts */}
          <div className="border-t border-black/5 p-6">
            <h3 className="text-sm font-semibold">
              Recent highlights <span className="font-normal text-foreground/50">· last {summary?.period_days ?? days} days</span>
            </h3>
            {summary && summary.top_posts.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {summary.top_posts.map((p) => (
                  <div key={p.ig_media_id} className="overflow-hidden rounded-xl ring-1 ring-black/5">
                    <div className="aspect-square overflow-hidden">
                      <KitThumb id={p.ig_media_id} />
                    </div>
                    <div className="space-y-0.5 p-1.5 text-[10px] text-foreground/60">
                      <span className="flex items-center gap-1">
                        <Heart className="h-2.5 w-2.5" /> <span className="num">{fmt(p.interactions)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-2.5 w-2.5" /> <span className="num">{fmt(p.views)}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <CardEmpty label="No posts in this window yet — hit Sync to pull your latest data." />
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between border-t border-black/5 px-6 py-3 text-[10px] text-foreground/45">
            <span className="flex items-center gap-1.5">
              <span className="bg-ig grid h-4 w-4 place-items-center rounded text-white">
                <Sparkles className="h-2.5 w-2.5" />
              </span>
              Generated with InfluenceIQ
            </span>
            <span className="num">{new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

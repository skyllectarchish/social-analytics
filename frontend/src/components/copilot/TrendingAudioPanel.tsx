import { useEffect, useState } from "react";
import { Check, Copy, Music } from "lucide-react";
import { safeGet } from "../../api/client";
import type { TrendingAudioItem, TrendingAudioResponse } from "../../api/types";
import { trendingAudio } from "../../data/mock";
import { Skeleton } from "../dashboard/Skeletons";

// Fallback used before a week is published (or if the backend isn't reachable):
// the landing-page sample, mapped into the real shape and flagged as a sample.
const FALLBACK: TrendingAudioItem[] = trendingAudio.map((t) => ({
  title: t.title,
  artist: "",
  reels_count: t.reels,
  delta: t.delta,
  use_case: "",
  source: "sample",
}));

function fmtWeek(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Editorial trending-audio feed — curated weekly from public roundups, NOT from
// Meta (the Graph API has no trending-audio data). Clearly labeled as editorial.
export default function TrendingAudioPanel() {
  const [data, setData] = useState<TrendingAudioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    safeGet<TrendingAudioResponse>("/instagram/trending-audio").then((r) => {
      if (!alive) return;
      setData(r);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const live = (data?.items?.length ?? 0) > 0;
  const items = live ? data!.items : FALLBACK;
  const source = live ? data!.items[0]?.source : "sample data";

  async function copy(it: TrendingAudioItem, idx: number) {
    try {
      await navigator.clipboard.writeText(it.artist ? `${it.title} — ${it.artist}` : it.title);
      setCopied(idx);
      window.setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="card-hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Music className="h-4 w-4 text-violet" /> Trending audio
          </h2>
          <p className="text-xs text-foreground/55">
            Editorial · curated weekly
            {live && data?.week ? ` · week of ${fmtWeek(data.week)}` : ""}
            {source ? ` · ${source}` : ""}
          </p>
        </div>
      </div>

      {/* Honest disclosure — distinct from the AI/insights features. */}
      <p className="mt-2 rounded-lg bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
        Instagram's API doesn't expose trending audio, so this is a hand-curated
        editorial list — not personalized to your account. Search the title in the
        Instagram app to use it.
      </p>

      {loading ? (
        <div className="mt-4 space-y-2.5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((t, i) => (
            <li key={`${t.title}-${i}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5">
              <span className="bg-ig grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white">
                <Music className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold leading-tight">{t.title}</div>
                <div className="truncate text-xs text-foreground/55">
                  {[t.artist, t.use_case || (t.reels_count ? `${t.reels_count} reels` : "")]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {t.delta && <span className="chip !bg-mint/50 !text-emerald-700 shrink-0">{t.delta}</span>}
              <button
                onClick={() => copy(t, i)}
                className="shrink-0 text-foreground/45 transition hover:text-violet-deep"
                title="Copy title"
              >
                {copied === i ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

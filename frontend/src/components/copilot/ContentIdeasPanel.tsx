import { useEffect, useState } from "react";
import { Check, Copy, Lightbulb, RefreshCw, Stethoscope } from "lucide-react";
import api, { safeGet } from "../../api/client";
import type { ContentIdeasResponse, Idea } from "../../api/types";
import { useAuthedImage } from "../../hooks/useAuthedImage";
import { Skeleton } from "../dashboard/Skeletons";
import { CardEmpty } from "../dashboard/States";
import AIMarkdown from "./AIMarkdown";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

const DAY_OPTIONS = [30, 90, 180];

const FORMAT_BADGE: Record<string, string> = {
  REELS: "bg-lavender text-violet-deep ring-violet/20",
  CAROUSEL: "bg-pink-50 text-pink-600 ring-pink-200",
  IMAGE: "bg-blue-50 text-blue-600 ring-blue-200",
  STORY: "bg-amber-50 text-amber-700 ring-amber-200",
};

function SourceThumb({ igId, score, onClick }: { igId: string; score: number; onClick: () => void }) {
  const src = useAuthedImage(igId);
  return (
    <button onClick={onClick} className="group relative shrink-0" title="Why did this post perform? · 1 AI call">
      {src ? (
        <img src={src} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-black/5 transition group-hover:ring-violet/50" />
      ) : (
        <span className="bg-lavender block h-14 w-14 rounded-xl" />
      )}
      <span className="num absolute -bottom-1 -right-1 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-semibold text-white">{score}</span>
      <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
        <Stethoscope className="h-4 w-4" />
      </span>
    </button>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${idea.title}\n\n${idea.body_md}`);
      setCopied(true);
      trackAI("ideas", "idea_copied", { refId: idea.id, meta: { format: idea.suggested_format } });
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className={`flex flex-col rounded-2xl bg-white p-4 ring-1 ${idea.adjacent ? "ring-dashed ring-violet/40" : "ring-black/5"}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${FORMAT_BADGE[idea.suggested_format] ?? FORMAT_BADGE.IMAGE}`}>
          {idea.suggested_format}
        </span>
        {idea.adjacent && <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet-deep">adjacent theme</span>}
      </div>
      <h3 className="mt-2 text-sm font-semibold">{idea.title}</h3>
      <AIMarkdown text={idea.body_md} className="mt-1 flex-1 !text-xs" />
      <p className="mt-2 text-[11px] italic text-foreground/50">{idea.rationale}</p>
      <div className="mt-2.5 flex items-center justify-between border-t border-black/5 pt-2">
        <button onClick={copy} className="flex items-center gap-1 text-[11px] font-medium text-violet-deep hover:underline">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
        <AIFeedback feature="ideas" refId={idea.id} />
      </div>
    </div>
  );
}

export default function ContentIdeasPanel({
  exhausted,
  onQuotaSpent,
  onDiagnose,
}: {
  exhausted: boolean;
  onQuotaSpent: () => void;
  onDiagnose: (igMediaId: string) => void;
}) {
  const [days, setDays] = useState(90);
  const [res, setRes] = useState<ContentIdeasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adjacentOnly, setAdjacentOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    safeGet<ContentIdeasResponse>("/ai/ideas", { days, limit: 5 }).then((r) => {
      if (!alive) return;
      setRes(r);
      setLoading(false);
      if (r) trackAI("ideas", "rendered", { meta: { days, ideas_count: r.ideas.length } });
    });
    return () => { alive = false; };
  }, [days]);

  async function refresh() {
    setRefreshing(true);
    trackAI("ideas", "refresh_clicked");
    try {
      const { data } = await api.get<ContentIdeasResponse>("/ai/ideas", { params: { days, limit: 5, refresh: true } });
      setRes(data);
      onQuotaSpent();
    } catch { /* error banner not worth it — old data stays */ }
    setRefreshing(false);
  }

  const ideas = (res?.ideas ?? []).filter((i) => !adjacentOnly || i.adjacent);

  return (
    <div className="card-hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Lightbulb className="h-4 w-4 text-amber-500" /> Content ideas
          </h2>
          <p className="text-xs text-foreground/55">Pitched from your own top-performing posts</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-black/5 p-0.5">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${days === d ? "bg-white text-violet-deep shadow-sm ring-1 ring-violet/20" : "text-foreground/60"}`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            disabled={refreshing || exhausted}
            title={exhausted ? "AI quota exhausted" : "New ideas · 1 AI call"}
            className="btn-glow !px-3.5 !py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> New ideas
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : !res || res.ideas.length === 0 ? (
        <CardEmpty label="Not enough post history to pitch ideas yet — Sync and publish a few posts first." />
      ) : (
        <>
          {res.themes_detected.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">Themes</span>
              {res.themes_detected.map((t) => <span key={t} className="chip !bg-lavender !text-[11px] !text-violet-deep">{t}</span>)}
            </div>
          )}

          {res.source_posts.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
                Based on · click a post to diagnose it
              </span>
              <div className="mt-1.5 flex gap-2.5 overflow-x-auto pb-1">
                {res.source_posts.map((p) => (
                  <SourceThumb key={p.ig_media_id} igId={p.ig_media_id} score={p.algorithm_score_pct} onClick={() => onDiagnose(p.ig_media_id)} />
                ))}
              </div>
            </div>
          )}

          <label className="mt-3 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-foreground/60">
            <input
              type="checkbox"
              checked={adjacentOnly}
              onChange={(e) => { setAdjacentOnly(e.target.checked); trackAI("ideas", "adjacent_toggled", { meta: { value: e.target.checked } }); }}
              className="accent-violet"
            />
            Show adjacent-theme ideas only
          </label>

          {ideas.length === 0 ? (
            <p className="mt-3 rounded-xl bg-black/[0.03] px-4 py-5 text-center text-sm text-foreground/55">
              No adjacent-theme ideas in this batch — try "New ideas".
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

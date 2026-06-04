import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, FlaskConical, Lightbulb, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { safeGet } from "../../api/client";
import { streamSSE } from "../../api/aiStream";
import type { DigestBullet, WeeklyDigestResponse } from "../../api/types";
import { Skeleton } from "../dashboard/Skeletons";
import AIMarkdown from "./AIMarkdown";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

// Monday (UTC) of the week containing `d`, as YYYY-MM-DD.
function mondayOf(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
const shiftWeek = (weekOf: string, weeks: number): string => {
  const dt = new Date(`${weekOf}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + weeks * 7);
  return dt.toISOString().slice(0, 10);
};

const KIND_STYLE: Record<DigestBullet["kind"], { label: string; cls: string; Icon: typeof Sparkles }> = {
  win: { label: "Win", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: Sparkles },
  warning: { label: "Warning", cls: "bg-rose-50 text-rose-600 ring-rose-200", Icon: AlertTriangle },
  trend: { label: "Trend", cls: "bg-lavender text-violet-deep ring-violet/20", Icon: TrendingUp },
  experiment: { label: "Experiment", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: FlaskConical },
};

export default function WeeklyDigestCard({
  exhausted,
  onQuotaSpent,
}: {
  exhausted: boolean;
  onQuotaSpent: () => void;
}) {
  const currentWeek = mondayOf(new Date());
  const [weekOf, setWeekOf] = useState(currentWeek);
  const [digest, setDigest] = useState<WeeklyDigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamText, setStreamText] = useState<string | null>(null); // non-null = streaming
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (week: string) => {
    setLoading(true);
    const res = await safeGet<WeeklyDigestResponse>("/ai/digest/weekly", { week_of: week });
    setDigest(res);
    setLoading(false);
    if (res) trackAI("digest", "rendered", { refId: res.week_of, meta: { cached: res.cached, status: res.status } });
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    setStreamText(null);
    setError(null);
    load(weekOf);
    return () => abortRef.current?.abort();
  }, [weekOf, load]);

  async function regenerate() {
    setError(null);
    setStreamText("");
    trackAI("digest", "regenerate_clicked", { refId: weekOf });
    const started = performance.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const week = weekOf;
    const result = await streamSSE<WeeklyDigestResponse>(`/ai/digest/stream?week_of=${week}`, {
      onToken: (t) => setStreamText((s) => (s ?? "") + t),
      signal: ctrl.signal,
    });
    // User may have navigated weeks mid-stream — drop a stale result.
    if (week !== weekOf && result.kind === "done") return;
    setStreamText(null);
    if (result.kind === "done") {
      setDigest(result.payload);
      onQuotaSpent();
      trackAI("digest", "regenerate_succeeded", { refId: week, latencyMs: performance.now() - started });
    } else if (result.code !== "eof" || !ctrl.signal.aborted) {
      setError(result.message);
      trackAI("digest", "regenerate_failed", { refId: week, meta: { error_code: result.code } });
    }
  }

  const ageHours = digest ? Math.round((Date.now() - new Date(digest.generated_at).getTime()) / 3.6e6) : 0;
  const streaming = streamText !== null;
  const hasContent = !!digest?.narrative_md;

  return (
    <div className="card-hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-violet" /> Weekly digest
          </h2>
          <p className="text-xs text-foreground/55">
            Week of <span className="num">{weekOf}</span>
            {digest?.cached && hasContent && <> · refreshed {ageHours < 1 ? "just now" : `${ageHours}h ago`}</>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWeekOf(shiftWeek(weekOf, -1))} disabled={streaming} className="rounded-lg p-1.5 text-foreground/50 transition hover:bg-black/5 disabled:opacity-40" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setWeekOf(shiftWeek(weekOf, 1))} disabled={streaming || weekOf >= currentWeek} className="rounded-lg p-1.5 text-foreground/50 transition hover:bg-black/5 disabled:opacity-40" aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={regenerate}
            disabled={streaming || exhausted}
            title={exhausted ? "AI quota exhausted — resets next month" : "Regenerate · 1 AI call"}
            className="btn-glow !px-3.5 !py-2 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${streaming ? "animate-spin" : ""}`} /> Regenerate
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-rose-200">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
        ) : streaming ? (
          streamText ? (
            <div aria-live="polite">
              <AIMarkdown text={streamText} />
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-violet" aria-hidden />
            </div>
          ) : (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
              <p className="text-xs text-foreground/50">Reading your week…</p>
            </div>
          )
        ) : digest?.status === "not_enough_data" ? (
          <p className="rounded-xl bg-black/[0.03] px-4 py-6 text-center text-sm text-foreground/55">
            Not enough posts this week to summarize — keep publishing and check back.
          </p>
        ) : !hasContent ? (
          <p className="rounded-xl bg-black/[0.03] px-4 py-6 text-center text-sm text-foreground/55">
            No digest for this week yet — hit <strong>Regenerate</strong> to write one (1 AI call).
          </p>
        ) : (
          <>
            <AIMarkdown text={digest.narrative_md} />

            {digest.bullets.length > 0 && (
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {digest.bullets.map((b, i) => {
                  const k = KIND_STYLE[b.kind];
                  return (
                    <div key={i} className="rounded-xl bg-black/[0.02] p-3 ring-1 ring-black/5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${k.cls}`}>
                        <k.Icon className="h-3 w-3" /> {k.label}
                      </span>
                      <div className="mt-1.5 text-sm font-semibold">{b.headline}</div>
                      <AIMarkdown text={b.detail_md} className="!text-xs" />
                    </div>
                  );
                })}
              </div>
            )}

            {digest.followups.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">Try next</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {digest.followups.map((f, i) => (
                    <span key={i} className="chip !text-[11px]"><Lightbulb className="h-3 w-3 text-amber-500" /> {f}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5">
              <span className="num text-[10px] text-foreground/45">
                {digest.metrics_snapshot.posts_count} posts analysed
                {digest.metrics_snapshot.follows_delta != null && <> · {digest.metrics_snapshot.follows_delta >= 0 ? "+" : ""}{digest.metrics_snapshot.follows_delta} followers</>}
              </span>
              <AIFeedback feature="digest" refId={digest.week_of} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

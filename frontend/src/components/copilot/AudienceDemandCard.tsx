import { useState } from "react";
import { HelpCircle, Loader2, Pickaxe } from "lucide-react";
import api, { errorMessage } from "../../api/client";
import type { QuestionMiningResponse } from "../../api/types";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

const FORMAT_BADGE: Record<string, string> = {
  REELS: "bg-lavender text-violet-deep ring-violet/20",
  CAROUSEL: "bg-pink-50 text-pink-600 ring-pink-200",
  IMAGE: "bg-blue-50 text-blue-600 ring-blue-200",
  STORY: "bg-amber-50 text-amber-700 ring-amber-200",
};

// Clusters audience questions from comments into demand topics. Mining is
// explicit (button) because it charges a quota call.
const DAY_OPTIONS = [30, 90, 180];

export default function AudienceDemandCard({
  exhausted,
  onQuotaSpent,
}: {
  exhausted: boolean;
  onQuotaSpent: () => void;
}) {
  const [days, setDays] = useState(90);
  const [demo, setDemo] = useState(false);
  const [res, setRes] = useState<QuestionMiningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mine() {
    setLoading(true);
    setError(null);
    trackAI("question_mining", "requested", { meta: { days, demo } });
    try {
      const { data } = await api.post<QuestionMiningResponse>("/ai/question-mining", null, { params: { days, demo } });
      setRes(data);
      if (data.topics.length > 0) onQuotaSpent();
    } catch (err) {
      setError(errorMessage(err, "Mining failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Pickaxe className="h-4 w-4 text-amber-600" /> Audience demand
          </h2>
          <p className="text-xs text-foreground/55">
            Clusters the questions your audience asks in comments into content they're begging for
          </p>
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
            onClick={mine}
            disabled={loading || exhausted}
            title={exhausted ? "AI quota exhausted" : `Mine questions from the last ${days} days · 1 AI call`}
            className="btn-glow !px-4 !py-2 text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe className="h-4 w-4" />}
            Mine questions
          </button>
        </div>
      </div>

      <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-foreground/60">
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="accent-violet" />
        Include demo comments (until Meta App Review unlocks real ones)
      </label>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

      {res && res.topics.length === 0 && (
        <p className="mt-3 rounded-xl bg-black/[0.03] px-4 py-5 text-center text-sm text-foreground/55">
          Only {res.questions_analyzed} audience questions found in the last {res.period_days} days — comment
          data needs Meta's Advanced Access (App Review) before there's enough to mine. Tick "Include demo
          comments" to see the feature in action meanwhile.
        </p>
      )}

      {res && res.topics.length > 0 && (
        <>
          <p className="mt-3 flex items-center gap-2 text-[11px] text-foreground/50">
            {res.questions_analyzed} questions analyzed from the last {res.period_days} days
            {res.demo && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                demo data
              </span>
            )}
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {res.topics.map((t) => (
              <div key={t.id} className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t.topic}</h3>
                  <span className="num shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    ×{t.question_count}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {t.sample_questions.map((q, i) => (
                    <p key={i} className="flex items-start gap-1 text-[11px] italic text-foreground/55">
                      <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" /> “{q}”
                    </p>
                  ))}
                </div>
                <p className="mt-2 flex-1 text-xs">{t.content_pitch}</p>
                <div className="mt-2.5 flex items-center justify-between border-t border-black/5 pt-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${FORMAT_BADGE[t.suggested_format]}`}>
                    {t.suggested_format}
                  </span>
                  <AIFeedback feature="question_mining" refId={t.id} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

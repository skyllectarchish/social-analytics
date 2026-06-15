import { useState } from "react";
import { Check, Copy, Loader2, Sparkles, Zap } from "lucide-react";
import api, { errorMessage } from "../../api/client";
import type { HooksResponse } from "../../api/types";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

// Angle label → chip styling. Unknown angles fall back to the neutral chip.
const ANGLE_BADGE: Record<string, string> = {
  "curiosity gap": "bg-violet/10 text-violet-deep",
  "bold claim": "bg-pink-50 text-pink-600",
  question: "bg-blue-50 text-blue-600",
  contrarian: "bg-amber-50 text-amber-700",
  "relatable pain": "bg-rose-50 text-rose-600",
  "result tease": "bg-emerald-50 text-emerald-700",
};

// Topic → a set of distinct scroll-stopping hooks, in the creator's voice.
export default function ViralHooksPanel({
  exhausted,
  onQuotaSpent,
}: {
  exhausted: boolean;
  onQuotaSpent: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [res, setRes] = useState<HooksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function run() {
    if (topic.trim().length < 3) {
      setError("Give me a topic — a few words is enough.");
      return;
    }
    setLoading(true);
    setError(null);
    trackAI("hooks", "requested");
    try {
      const { data } = await api.post<HooksResponse>("/ai/hooks", { topic: topic.trim() });
      setRes(data);
      onQuotaSpent();
    } catch (err) {
      setError(errorMessage(err, "Could not generate hooks"));
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      trackAI("hooks", "hook_copied", { meta: { idx } });
      window.setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="card-hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-4 w-4 text-violet" /> Viral hooks
          </h2>
          <p className="text-xs text-foreground/55">
            Scroll-stopping opening lines for a topic — modeled on your top reels
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={300}
          placeholder="What's the reel about? e.g. my morning skincare routine"
          onKeyDown={(e) => { if (e.key === "Enter" && !loading) run(); }}
          className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/40"
        />
        <button
          onClick={run}
          disabled={loading || exhausted || topic.trim().length < 3}
          title={exhausted ? "AI quota exhausted" : "Generate hooks · 1 AI call"}
          className="btn-glow shrink-0 !px-4 !py-2 text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate hooks
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

      {res && res.hooks.length > 0 && (
        <div className="mt-4 border-t border-black/5 pt-4">
          <ul className="space-y-2.5">
            {res.hooks.map((h, i) => (
              <li key={i} className="rounded-2xl bg-white p-3.5 ring-1 ring-black/5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-snug">{h.text}</p>
                  <button
                    onClick={() => copy(h.text, i)}
                    className="shrink-0 text-foreground/45 transition hover:text-violet-deep"
                    title="Copy hook"
                  >
                    {copiedIdx === i ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {h.angle && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ANGLE_BADGE[h.angle.toLowerCase()] ?? "bg-black/5 text-foreground/60"}`}>
                      {h.angle}
                    </span>
                  )}
                  {h.rationale && <span className="text-[11px] italic text-foreground/50">{h.rationale}</span>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-end">
            <AIFeedback feature="hooks" refId={res.topic} />
          </div>
        </div>
      )}
    </div>
  );
}

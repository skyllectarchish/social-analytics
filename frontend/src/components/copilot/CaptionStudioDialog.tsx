import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, PenLine, Wand2, X } from "lucide-react";
import axios from "axios";
import api from "../../api/client";
import type { CaptionSuggestResponse, CaptionVariant } from "../../api/types";
import AIMarkdown from "./AIMarkdown";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

const FORMATS = ["REELS", "CAROUSEL", "IMAGE", "STORY"] as const;
const WARN_AT = 2000;
const MAX_LEN = 2200; // Instagram caption limit

// Words present in the variant but not in the draft get highlighted, so the
// rewrite is scannable at a glance.
function DiffCaption({ draft, caption }: { draft: string; caption: string }) {
  const draftWords = useMemo(() => new Set(draft.toLowerCase().split(/\s+/).filter(Boolean)), [draft]);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
      {caption.split(/(\s+)/).map((tok, i) =>
        /\S/.test(tok) && !draftWords.has(tok.toLowerCase().replace(/[.,!?;:]+$/, "")) && !draftWords.has(tok.toLowerCase()) ? (
          <mark key={i} className="rounded bg-emerald-100/80 px-0.5 text-emerald-900">{tok}</mark>
        ) : (
          tok
        ),
      )}
    </p>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? "#10b981" : value >= 40 ? "#f59e0b" : "#f43f5e";
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-foreground/60">{label}</span>
        <span className="num font-semibold">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ type: "spring", duration: 0.8, bounce: 0 }}
          className="h-full rounded-full"
          style={{ background: tone }}
        />
      </div>
    </div>
  );
}

function VariantCard({ v, draft, onUse }: { v: CaptionVariant; draft: string; onUse: (caption: string) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(v.caption);
      setCopied(true);
      trackAI("caption", "variant_copied", { meta: { variant_label: v.label } });
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <span className="w-fit rounded-full bg-lavender px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-deep">{v.label}</span>
      <div className="mt-2 flex-1"><DiffCaption draft={draft} caption={v.caption} /></div>
      <p className="mt-2 text-[11px] italic text-foreground/50">{v.rationale}</p>
      <div className="mt-2.5 flex items-center gap-2 border-t border-black/5 pt-2">
        <button onClick={copy} className="flex items-center gap-1 text-[11px] font-medium text-violet-deep hover:underline">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
        <button onClick={() => onUse(v.caption)} className="ml-auto rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-white">
          Use this
        </button>
        <AIFeedback feature="caption" refId={v.id} />
      </div>
    </div>
  );
}

export default function CaptionStudioDialog({
  open,
  onClose,
  exhausted,
  onQuotaSpent,
}: {
  open: boolean;
  onClose: () => void;
  exhausted: boolean;
  onQuotaSpent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("REELS");
  const [topicHint, setTopicHint] = useState("");
  const [result, setResult] = useState<CaptionSuggestResponse | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    trackAI("caption", "opened");
    const t = window.setTimeout(() => textareaRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const overWarn = draft.length >= WARN_AT;
  const overMax = draft.length > MAX_LEN;

  async function score() {
    if (!draft.trim() || overMax || scoring) return;
    setScoring(true);
    setError(null);
    const started = performance.now();
    try {
      const { data } = await api.post<CaptionSuggestResponse>("/ai/caption/suggest", {
        draft,
        format,
        ...(topicHint.trim() ? { topic_hint: topicHint.trim() } : {}),
      });
      setResult(data);
      onQuotaSpent();
      trackAI("caption", "scored", { latencyMs: performance.now() - started, meta: { overall_score: data.scores.overall, draft_len: draft.length } });
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(status === 429 ? "AI quota exhausted — scoring resumes at the next monthly reset." : "Couldn't score this draft — try again.");
    } finally {
      setScoring(false);
    }
  }

  function useVariant(caption: string) {
    setDraft(caption);
    setResult(null);
    trackAI("caption", "variant_used");
    textareaRef.current?.focus();
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[rgba(10,14,39,0.35)] backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="relative max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-label="Caption studio"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <PenLine className="h-4 w-4 text-violet" /> Caption studio
                </h2>
                <p className="text-xs text-foreground/55">Score your draft and get rewrites tuned to your audience</p>
              </div>
              <button onClick={onClose} className="rounded-full p-1.5 text-foreground/60 transition hover:bg-black/5" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="Paste your draft caption…"
              className="mt-4 w-full resize-y rounded-2xl bg-black/[0.03] p-3.5 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/50"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-full bg-black/5 p-0.5">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${format === f ? "bg-white text-violet-deep shadow-sm ring-1 ring-violet/20" : "text-foreground/60"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
                maxLength={200}
                placeholder="Topic hint (optional)"
                className="min-w-40 flex-1 rounded-full bg-black/[0.03] px-3 py-1.5 text-xs outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/50"
              />
              <span className={`num text-[11px] ${overMax ? "font-semibold text-rose-500" : overWarn ? "text-amber-600" : "text-foreground/45"}`}>
                {draft.length} / {MAX_LEN}
              </span>
              <button
                onClick={score}
                disabled={scoring || exhausted || !draft.trim() || overMax}
                title={exhausted ? "AI quota exhausted" : undefined}
                className="btn-glow !px-4 !py-2 text-xs disabled:opacity-50"
              >
                {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Score draft · 1 AI call
              </button>
            </div>
            {overMax && <p className="mt-1 text-xs font-medium text-rose-500">Instagram captions max out at {MAX_LEN} characters.</p>}
            {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-rose-200">{error}</p>}

            {result && (
              <div className="mt-5">
                <div className="grid gap-3 rounded-2xl bg-black/[0.02] p-4 ring-1 ring-black/5 sm:grid-cols-4">
                  <ScoreBar label="Hook" value={result.scores.hook_strength} />
                  <ScoreBar label="CTA" value={result.scores.cta_presence} />
                  <ScoreBar label="Length fit" value={result.scores.length_fit} />
                  <ScoreBar label="Overall" value={result.scores.overall} />
                </div>
                {result.notes_md && (
                  <div className="mt-3 rounded-xl bg-violet/5 p-3 ring-1 ring-violet/15">
                    <AIMarkdown text={result.notes_md} className="!text-xs" />
                  </div>
                )}
                {result.variants.length > 0 && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {result.variants.map((v) => (
                      <VariantCard key={v.id} v={v} draft={result.draft || draft} onUse={useVariant} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  CornerDownLeft,
  AlertCircle,
} from "lucide-react";
import AppModal from "../shared/AppModal";
import { useCaptionStudio } from "../../hooks/useCaptionStudio";
import { useAIQuota } from "../../hooks/useAIQuota";
import AIMarkdown from "./AIMarkdown";
import AIEmptyState from "./AIEmptyState";
import { trackAI } from "../../utils/telemetry";

const FORMATS = [
  { value: "REELS",    label: "REELS",    color: "#7c3aed" },
  { value: "CAROUSEL", label: "CAROUSEL", color: "#b45309" },
  { value: "IMAGE",    label: "IMAGE",    color: "#0e7490" },
  { value: "STORY",    label: "STORY",    color: "#be185d" },
];

const SCORE_BARS = [
  { key: "hook_strength", label: "Hook" },
  { key: "cta_presence",  label: "CTA" },
  { key: "length_fit",    label: "Length" },
  { key: "overall",       label: "Overall" },
];

const CHAR_LIMIT = 2200;
const CHAR_WARN_AT = 2000;

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

// Lightweight word-level diff using the LCS approach. Returns an array of
// { text, kind } where kind is "kept" | "added". We only highlight added
// tokens in the variant (vs the draft) — that's the signal the user wants:
// "what's new in this rewrite?" Punctuation/spaces are preserved by
// splitting on whitespace boundaries while keeping the separators.
function tokenize(s) {
  // Match: whitespace runs, then non-whitespace runs. Keeps order/spacing.
  return s.match(/\s+|\S+/g) || [];
}
function diffAdded(originalText, variantText) {
  const a = tokenize((originalText || "").toLowerCase());
  const b = tokenize(variantText || "");
  const bLower = b.map((t) => t.toLowerCase());

  // LCS DP — small inputs (caption-sized), O(a*b) is fine.
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === bLower[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Walk to extract diff against `b` (the variant).
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === bLower[j]) {
      out.push({ text: b[j], kind: "kept" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      out.push({ text: b[j], kind: "added" });
      j++;
    }
  }
  while (j < n) {
    out.push({ text: b[j], kind: "added" });
    j++;
  }
  return out;
}

function ScoreBar({ label, value }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 75 ? "#10b981" : v >= 50 ? "#7c3aed" : v >= 25 ? "#b45309" : "#e11d48";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
          {label}
        </span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
          {v}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(15,23,42,0.06)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${v}%` }}
          transition={{ type: "spring", duration: 0.6, bounce: 0 }}
        />
      </div>
    </div>
  );
}

function DiffView({ original, variant }) {
  const segments = useMemo(() => diffAdded(original, variant), [original, variant]);
  return (
    <p className="text-[12.5px] text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
      {segments.map((seg, i) =>
        seg.kind === "added" ? (
          <mark
            key={i}
            style={{
              background: "rgba(16,185,129,0.16)",
              color: "#065f46",
              padding: "1px 2px",
              borderRadius: 3,
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

function VariantCard({ variant, originalDraft, onCopy, onUse }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(variant.caption);
      setCopied(true);
      trackAI("caption", "variant_copied", { meta: { variant_label: variant.label } });
      onCopy?.(variant);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.32, bounce: 0 }}
      className="rounded-xl p-3.5 bg-white space-y-2.5"
      style={{ border: "1px solid rgba(15,23,42,0.08)" }}
    >
      <header className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md"
          style={{
            background: "rgba(139,92,246,0.10)",
            color: "#7c3aed",
            border: "1px solid rgba(139,92,246,0.20)",
          }}
        >
          <Sparkles size={9} /> {variant.label}
        </span>
      </header>

      <DiffView original={originalDraft} variant={variant.caption} />

      {variant.rationale && (
        <p className="text-[11px] text-slate-500 italic leading-relaxed border-l-2 border-slate-100 pl-2">
          {variant.rationale}
        </p>
      )}

      <footer className="flex items-center gap-2 pt-1.5 border-t border-slate-100">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
          style={{
            background: copied ? "rgba(16,185,129,0.10)" : "rgba(15,23,42,0.04)",
            color: copied ? "#10b981" : "#475569",
            border: `1px solid ${copied ? "rgba(16,185,129,0.22)" : "rgba(15,23,42,0.06)"}`,
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => onUse?.(variant)}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(109,40,217,0.20)",
          }}
        >
          <CornerDownLeft size={11} /> Use this
        </button>
      </footer>
    </motion.article>
  );
}

export default function CaptionStudioDialog({
  open,
  onClose,
  initialDraft = "",
  initialFormat = "REELS",
  initialTopicHint = "",
  onAccept,
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [format, setFormat] = useState(initialFormat);
  const [topicHint, setTopicHint] = useState(initialTopicHint);
  const { result, loading, error, quotaBlocked, score, reset } = useCaptionStudio();
  const { exhausted, resetsAt } = useAIQuota();
  const textareaRef = useRef(null);
  const limitExceededFiredRef = useRef(false);

  // Reset state on close so re-open is clean. (AppModal/react-bootstrap handles
  // focus trapping, Escape, scroll-lock and focus restoration to the trigger.)
  useEffect(() => {
    if (!open) {
      setDraft(initialDraft);
      setFormat(initialFormat);
      setTopicHint(initialTopicHint);
      limitExceededFiredRef.current = false;
      reset();
    }
  }, [open, initialDraft, initialFormat, initialTopicHint, reset]);

  // Fire char_limit_exceeded the first time the draft passes 2200 per dialog
  // session.
  useEffect(() => {
    if (!open) return;
    if (draft.length > CHAR_LIMIT && !limitExceededFiredRef.current) {
      limitExceededFiredRef.current = true;
      trackAI("caption", "char_limit_exceeded", { meta: { length: draft.length } });
    }
  }, [draft, open]);

  const canScore = draft.trim().length > 0 && !loading && !exhausted;
  const charLen = draft.length;
  const overWarn = charLen >= CHAR_WARN_AT && charLen <= CHAR_LIMIT;
  const overLimit = charLen > CHAR_LIMIT;

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!canScore) return;
      const t0 = Date.now();
      const res = await score({ draft, format, topic_hint: topicHint || undefined });
      if (res) {
        trackAI("caption", "scored", {
          meta: {
            overall_score: res.scores?.overall,
            draft_len: draft.length,
          },
          latency_ms: Date.now() - t0,
        });
      }
    },
    [canScore, draft, format, topicHint, score],
  );

  const handleUse = useCallback(
    (variant) => {
      trackAI("caption", "variant_used", { meta: { variant_label: variant.label } });
      if (onAccept) {
        onAccept(variant.caption);
        onClose?.();
      } else {
        // No external handler — copy to clipboard so "Use this" still does
        // something useful for the user.
        copyToClipboard(variant.caption).catch(() => {});
        onClose?.();
      }
    },
    [onAccept, onClose],
  );

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Caption Studio"
      icon={Sparkles}
      size="lg"
      fullscreenSmDown
      initialFocusRef={textareaRef}
    >
            <form
              onSubmit={handleSubmit}
              className="px-5 py-4 space-y-4"
            >
              <div className="flex flex-wrap gap-2 items-center">
                <div
                  className="inline-flex rounded-lg overflow-hidden text-[11px] font-medium"
                  style={{ border: "1px solid rgba(15,23,42,0.08)" }}
                  role="group"
                  aria-label="Format"
                >
                  {FORMATS.map((f, idx) => {
                    const active = format === f.value;
                    return (
                      <button
                        type="button"
                        key={f.value}
                        onClick={() => setFormat(f.value)}
                        disabled={loading}
                        aria-pressed={active}
                        className="px-2.5 py-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{
                          background: active ? "rgba(139,92,246,0.12)" : "transparent",
                          color: active ? "#7c3aed" : "#64748b",
                          borderRight:
                            idx === FORMATS.length - 1
                              ? "none"
                              : "1px solid rgba(15,23,42,0.08)",
                        }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  value={topicHint}
                  onChange={(e) => setTopicHint(e.target.value)}
                  disabled={loading}
                  placeholder='Topic (optional) — e.g. "morning routine"'
                  className="flex-1 min-w-[180px] px-2.5 py-1 rounded-lg text-[12px] focus:outline-none focus:border-violet-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid rgba(15,23,42,0.08)",
                    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
                  }}
                />
              </div>

              <div>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={loading}
                  placeholder="Paste a draft caption to score and get variants…"
                  rows={6}
                  className="w-full px-3 py-2.5 rounded-xl text-[13.5px] leading-relaxed focus:outline-none focus:border-violet-400 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid rgba(15,23,42,0.10)",
                    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
                    minHeight: 140,
                  }}
                  aria-label="Draft caption"
                />
                <div className="flex items-center justify-between mt-1.5 text-[11px]">
                  <span
                    className={
                      overLimit ? "text-rose-600" : overWarn ? "text-amber-600" : "text-slate-500"
                    }
                  >
                    {overLimit
                      ? `Over Instagram's ${CHAR_LIMIT.toLocaleString()} char limit — your caption will be truncated.`
                      : overWarn
                      ? `Getting close to Instagram's ${CHAR_LIMIT.toLocaleString()} char limit.`
                      : ""}
                  </span>
                  <span
                    className="font-mono tabular-nums"
                    style={{ color: overLimit ? "#e11d48" : overWarn ? "#b45309" : "#94a3b8" }}
                  >
                    {charLen.toLocaleString()} / {CHAR_LIMIT.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                {exhausted && (
                  <span className="text-[11px] text-slate-500">
                    At quota · Resets {resetsAt ? new Date(resetsAt).toLocaleDateString() : "soon"}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={!canScore}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-all"
                  style={{
                    background: !canScore
                      ? "rgba(15,23,42,0.06)"
                      : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    color: !canScore ? "#94a3b8" : "#fff",
                    border: "none",
                    cursor: !canScore ? "not-allowed" : "pointer",
                    boxShadow: !canScore ? "none" : "0 4px 12px rgba(109,40,217,0.22)",
                  }}
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {loading ? "Scoring…" : "Score draft · 1 AI call"}
                </button>
              </div>

              {quotaBlocked && (
                <AIEmptyState
                  icon={AlertCircle}
                  title="You've used your AI calls"
                  body={`Resets ${resetsAt ? new Date(resetsAt).toLocaleDateString() : "soon"}.`}
                  tone="warning"
                />
              )}

              {error && !quotaBlocked && (
                <div
                  className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2"
                  style={{
                    background: "rgba(244,63,94,0.06)",
                    border: "1px solid rgba(244,63,94,0.18)",
                    color: "#9f1239",
                  }}
                >
                  <AlertCircle size={12} />
                  {error}
                </div>
              )}

              {result && !loading && (
                <section aria-label="Results" className="space-y-4 pt-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                      Scores
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {SCORE_BARS.map((b) => (
                        <ScoreBar
                          key={b.key}
                          label={b.label}
                          value={result.scores?.[b.key]}
                        />
                      ))}
                    </div>
                  </div>

                  {result.notes_md && (
                    <div
                      className="rounded-xl px-4 py-3"
                      style={{
                        background: "rgba(139,92,246,0.04)",
                        border: "1px solid rgba(139,92,246,0.14)",
                      }}
                    >
                      <AIMarkdown source={result.notes_md} />
                    </div>
                  )}

                  {result.variants?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Variants
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {result.variants.map((v) => (
                          <VariantCard
                            key={v.id}
                            variant={v}
                            originalDraft={result.draft || draft}
                            onUse={handleUse}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </form>
    </AppModal>
  );
}

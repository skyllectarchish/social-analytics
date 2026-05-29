import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trackAI } from "../../utils/telemetry";
import MediaThumb from "../shared/MediaThumb";
import {
  X,
  Loader2,
  ChevronDown,
  TriangleAlert,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  RefreshCcw,
} from "lucide-react";
import { usePostDiagnostic } from "../../hooks/usePostDiagnostic";
import AIMarkdown from "./AIMarkdown";
import AIFeedbackButtons from "./AIFeedbackButtons";
import AIEmptyState from "./AIEmptyState";

const SEVERITY_TOKENS = {
  high:    { label: "HIGH",    color: "#e11d48", bg: "rgba(244,63,94,0.08)",  border: "rgba(244,63,94,0.22)",  icon: TriangleAlert },
  medium:  { label: "MEDIUM",  color: "#b45309", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.24)", icon: ShieldAlert },
  low:     { label: "LOW",     color: "#475569", bg: "rgba(15,23,42,0.05)",   border: "rgba(15,23,42,0.10)",   icon: AlertCircle },
  neutral: { label: "NEUTRAL", color: "#475569", bg: "rgba(15,23,42,0.04)",   border: "rgba(15,23,42,0.08)",   icon: AlertCircle },
};

const FACTOR_TYPE_LABELS = {
  format:    "Format",
  timing:    "Timing",
  hashtags:  "Hashtag mix",
  topic:     "Topic",
  duration:  "Duration",
  hook:      "Hook",
};

function fmtPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function fmtCount(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function deltaPct(observed, baseline) {
  if (!baseline || baseline === 0) return null;
  return ((observed - baseline) / baseline) * 100;
}

function MetricRow({ label, observed, baseline, isPct = false }) {
  const delta = deltaPct(observed, baseline);
  const isDown = delta !== null && delta < 0;
  const isUp = delta !== null && delta > 0;
  const deltaColor = isDown ? "#e11d48" : isUp ? "#10b981" : "#94a3b8";
  return (
    <div className="grid grid-cols-3 gap-2 items-center py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
        {label}
      </span>
      <div>
        <p className="text-[10px] text-slate-500">Observed</p>
        <p className="text-[14px] font-semibold text-slate-900">
          {isPct ? `${observed?.toFixed?.(1) ?? "—"}%` : fmtCount(observed)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-slate-500">
          Baseline {delta !== null && <span style={{ color: deltaColor }}>· {fmtPct(delta)}</span>}
        </p>
        <p className="text-[14px] font-semibold text-slate-600">
          {isPct ? `${baseline?.toFixed?.(1) ?? "—"}%` : fmtCount(baseline)}
        </p>
      </div>
    </div>
  );
}

function FactorRow({ factor, igMediaId }) {
  const [open, setOpen] = useState(false);
  const token = SEVERITY_TOKENS[factor.severity] || SEVERITY_TOKENS.neutral;
  const Icon = token.icon;
  const typeLabel = FACTOR_TYPE_LABELS[factor.key] || factor.key;

  const handleToggle = () => {
    setOpen((v) => {
      if (!v) {
        trackAI("diagnostic", "factor_expanded", {
          refId: igMediaId,
          meta: { factor_key: factor.key },
        });
      }
      return !v;
    });
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${token.border}`, background: token.bg }}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: "#fff", color: token.color, border: `1px solid ${token.border}` }}
        >
          <Icon size={10} /> {token.label}
        </span>
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {typeLabel}
        </span>
        <p className="flex-1 text-[12.5px] font-medium text-slate-800 min-w-0">
          {factor.headline}
        </p>
        <ChevronDown
          size={14}
          className="text-slate-500 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1 space-y-2">
              {factor.detail_md && (
                <div className="text-[12px] text-slate-700">
                  <AIMarkdown source={factor.detail_md} />
                </div>
              )}
              {factor.evidence && (
                <div className="text-[11px] text-slate-500 italic">
                  Evidence — <span className="font-semibold not-italic text-slate-700">
                    {factor.evidence.metric}: {fmtCount(factor.evidence.value)}
                  </span>
                  {factor.evidence.comparison && (
                    <> · vs {factor.evidence.comparison}</>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PostDiagnosticDrawer({ media, onClose }) {
  const igMediaId = media?.ig_media_id ?? null;
  const { data, loading, error, notEligible, refresh } = usePostDiagnostic(igMediaId);
  const previouslyFocusedRef = useRef(null);
  const renderedFiredRef = useRef(null);

  // Escape closes; capture previously-focused element and restore on close.
  useEffect(() => {
    if (!media) return;
    previouslyFocusedRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      try {
        previouslyFocusedRef.current?.focus?.();
      } catch {
        // best-effort
      }
    };
  }, [media, onClose]);

  // Fire `rendered` once per (ig_media_id, success) combination.
  useEffect(() => {
    if (!data || loading || !igMediaId) return;
    if (renderedFiredRef.current === igMediaId) return;
    renderedFiredRef.current = igMediaId;
    trackAI("diagnostic", "rendered", {
      refId: igMediaId,
      meta: {
        underperformed: !!data.underperformed,
        factor_count: data.factors?.length ?? 0,
      },
    });
  }, [data, loading, igMediaId]);

  const handleRetry = () => {
    trackAI("diagnostic", "retry_clicked", { refId: igMediaId });
    refresh();
  };

  const captionText = media?.caption ?? media?.caption_preview ?? "";
  const mediaTypeLabel =
    media?.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : media?.media_type;

  const mediaPillStyle = (() => {
    if (media?.media_type === "VIDEO")
      return { bg: "rgba(139,92,246,0.12)", color: "#7c3aed", border: "rgba(139,92,246,0.22)" };
    if (media?.media_type === "CAROUSEL_ALBUM")
      return { bg: "rgba(245,158,11,0.12)", color: "#b45309", border: "rgba(245,158,11,0.22)" };
    return { bg: "rgba(6,182,212,0.12)", color: "#0e7490", border: "rgba(6,182,212,0.22)" };
  })();

  const showBeatBaseline = data && !data.underperformed;

  return (
    <AnimatePresence>
      {media && (
        <>
          <motion.div
            key="diag-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(15,23,42,0.32)", backdropFilter: "blur(6px)" }}
            onClick={onClose}
          />

          <motion.div
            key="diag-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-y-auto"
            role="dialog"
            aria-labelledby="diag-title"
            aria-modal="true"
            style={{
              maxHeight: "85vh",
              background: "#fff",
              border: "1px solid rgba(15,23,42,0.06)",
              borderBottom: "none",
              boxShadow: "0 -16px 60px rgba(15,23,42,0.12), 0 -1px 0 rgba(15,23,42,0.06)",
            }}
          >
            <div
              style={{
                height: 2,
                background: "linear-gradient(90deg, #7C3AED 0%, #EC4899 50%, #F97316 100%)",
                borderRadius: "3px 3px 0 0",
              }}
            />
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(15,23,42,0.12)" }} />
            </div>

            <div className="px-5 pb-8 pt-2 space-y-5 max-w-3xl mx-auto">
              <div className="flex items-start gap-4">
                <MediaThumb
                  mediaId={igMediaId}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                  style={{ border: "1px solid rgba(15,23,42,0.08)" }}
                  fallback={
                    <div
                      className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.12))",
                      }}
                    >
                      <Sparkles size={16} className="text-violet-500" />
                    </div>
                  }
                />

                <div className="flex-1 min-w-0">
                  <h2 id="diag-title" className="text-[15px] font-semibold text-slate-900 leading-snug">
                    {loading ? "Diagnosing…" : "Post Diagnostic"}
                  </h2>
                  {captionText && (
                    <p
                      className="text-[12.5px] text-slate-600 leading-relaxed mt-1"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {captionText}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[11px] text-slate-500">
                    {mediaTypeLabel && (
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          background: mediaPillStyle.bg,
                          color: mediaPillStyle.color,
                          border: `1px solid ${mediaPillStyle.border}`,
                        }}
                      >
                        {mediaTypeLabel}
                      </span>
                    )}
                    {media?.timestamp && (
                      <span>
                        {new Date(media.timestamp).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {media?.permalink && (
                      <a
                        href={media.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-violet-600 hover:text-violet-700"
                      >
                        View on Instagram <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(15,23,42,0.05)",
                    color: "#64748b",
                    border: "1px solid rgba(15,23,42,0.06)",
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {loading && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
                  <Loader2 size={20} className="animate-spin text-violet-500" />
                  <p className="text-[12px]">Analyzing reach, timing, hashtags, and format…</p>
                </div>
              )}

              {notEligible && !loading && (
                <AIEmptyState
                  icon={AlertCircle}
                  title="This post is too recent"
                  body="Diagnostics need ≥24h of insights data. Check back tomorrow."
                  tone="warning"
                />
              )}

              {error && !loading && !notEligible && (
                <AIEmptyState
                  icon={AlertCircle}
                  title="Couldn't diagnose this post"
                  body={error}
                  tone="danger"
                  cta={
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
                      style={{
                        background: "rgba(139,92,246,0.10)",
                        color: "#7c3aed",
                        border: "1px solid rgba(139,92,246,0.20)",
                      }}
                    >
                      <RefreshCcw size={11} /> Try again
                    </button>
                  }
                />
              )}

              {data && !loading && (
                <>
                  {showBeatBaseline && (
                    <div
                      className="rounded-xl px-4 py-3 flex items-center gap-2"
                      style={{
                        background: "rgba(16,185,129,0.08)",
                        border: "1px solid rgba(16,185,129,0.22)",
                      }}
                    >
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <p className="text-[12.5px] text-emerald-700 font-medium">
                        This post actually beat your baseline. Here's why it worked.
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                      Compared to your baseline (last 60 posts)
                    </p>
                    <div
                      className="rounded-xl px-4 py-1"
                      style={{
                        background: "rgba(15,23,42,0.02)",
                        border: "1px solid rgba(15,23,42,0.06)",
                      }}
                    >
                      <MetricRow
                        label="Reach"
                        observed={data.observed?.avg_reach}
                        baseline={data.baseline?.avg_reach}
                      />
                      <MetricRow
                        label="Engagement"
                        observed={data.observed?.avg_engagement_rate_pct}
                        baseline={data.baseline?.avg_engagement_rate_pct}
                        isPct
                      />
                      <MetricRow
                        label="Save rate"
                        observed={data.observed?.avg_save_rate_pct}
                        baseline={data.baseline?.avg_save_rate_pct}
                        isPct
                      />
                    </div>
                  </div>

                  {data.verdict_md && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Verdict
                      </p>
                      <div
                        className="rounded-xl px-4 py-3"
                        style={{
                          background: "rgba(139,92,246,0.04)",
                          border: "1px solid rgba(139,92,246,0.14)",
                        }}
                      >
                        <AIMarkdown source={data.verdict_md} />
                      </div>
                    </div>
                  )}

                  {data.factors?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Factors
                      </p>
                      <div className="space-y-2">
                        {data.factors.map((f, i) => (
                          <FactorRow key={`${f.key}-${i}`} factor={f} igMediaId={igMediaId} />
                        ))}
                      </div>
                    </div>
                  )}

                  {data.recommendations_md && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        What to try next
                      </p>
                      <div
                        className="rounded-xl px-4 py-3"
                        style={{
                          background: "rgba(16,185,129,0.04)",
                          border: "1px solid rgba(16,185,129,0.16)",
                        }}
                      >
                        <AIMarkdown source={data.recommendations_md} />
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100">
                    <AIFeedbackButtons
                      feature="diagnostic"
                      refId={data.ig_media_id}
                      promptLabel="Was this diagnostic useful?"
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

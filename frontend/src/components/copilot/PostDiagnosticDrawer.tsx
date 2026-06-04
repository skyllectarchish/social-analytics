import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, RefreshCw, Stethoscope, X } from "lucide-react";
import axios from "axios";
import api from "../../api/client";
import type { DiagnosticFactor, DiagnosticResponse } from "../../api/types";
import { useAuthedImage } from "../../hooks/useAuthedImage";
import AIMarkdown from "./AIMarkdown";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

const SEVERITY: Record<DiagnosticFactor["severity"], string> = {
  high: "bg-rose-50 text-rose-600 ring-rose-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-blue-50 text-blue-600 ring-blue-200",
  neutral: "bg-black/5 text-foreground/60 ring-black/10",
};

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n * 100) / 100}`);

function MetricRow({ label, base, obs, unit = "" }: { label: string; base: number; obs: number; unit?: string }) {
  const delta = base > 0 ? ((obs - base) / base) * 100 : null;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-foreground/60">{label}</span>
      <span className="flex items-center gap-2">
        <span className="num text-xs text-foreground/45">{fmt(base)}{unit} baseline</span>
        <span className="num font-semibold">{fmt(obs)}{unit}</span>
        {delta != null && (
          <span className={`num text-xs font-medium ${delta >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(0)}%
          </span>
        )}
      </span>
    </div>
  );
}

function FactorRow({ factor, refId }: { factor: DiagnosticFactor; refId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl ring-1 ring-black/5">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) trackAI("diagnostic", "factor_expanded", { refId, meta: { factor_key: factor.key } });
        }}
        className="flex w-full items-center gap-2.5 p-3 text-left"
      >
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${SEVERITY[factor.severity]}`}>
          {factor.severity}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">{factor.headline}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-foreground/40 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-black/5 px-3 pb-3 pt-2">
          <AIMarkdown text={factor.detail_md} className="!text-xs" />
          {factor.evidence.metric && (
            <p className="num mt-1.5 text-[10px] text-foreground/45">
              Evidence: {factor.evidence.metric} = {factor.evidence.value}
              {factor.evidence.comparison && ` (${factor.evidence.comparison})`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Bottom drawer: "why did this post over/under-perform?" — POST /ai/diagnose-post.
export default function PostDiagnosticDrawer({
  igMediaId,
  onClose,
  onQuotaSpent,
}: {
  igMediaId: string | null;
  onClose: () => void;
  onQuotaSpent: () => void;
}) {
  const [diag, setDiag] = useState<DiagnosticResponse | null>(null);
  const [error, setError] = useState<{ kind: "too_recent" | "quota" | "other" } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const src = useAuthedImage(igMediaId);

  useEffect(() => {
    if (!igMediaId) return;
    let alive = true;
    setDiag(null);
    setError(null);
    trackAI("diagnostic", "opened", { refId: igMediaId });
    const started = performance.now();
    api
      .post<DiagnosticResponse>("/ai/diagnose-post", { ig_media_id: igMediaId })
      .then(({ data }) => {
        if (!alive) return;
        setDiag(data);
        onQuotaSpent();
        trackAI("diagnostic", "rendered", { refId: igMediaId, latencyMs: performance.now() - started, meta: { underperformed: data.underperformed, factor_count: data.factors.length } });
      })
      .catch((err) => {
        if (!alive) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        setError({ kind: status === 422 ? "too_recent" : status === 429 ? "quota" : "other" });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igMediaId, attempt]);

  useEffect(() => {
    if (!igMediaId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [igMediaId, onClose]);

  return (
    <AnimatePresence>
      {igMediaId && (
        <div className="fixed inset-0 z-50">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[rgba(10,14,39,0.35)] backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl"
            role="dialog"
            aria-label="Post diagnostic"
          >
            <div className="flex items-start gap-3">
              {src ? <img src={src} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-black/5" /> : <div className="bg-lavender h-14 w-14 rounded-xl" />}
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Stethoscope className="h-4 w-4 text-violet" /> Post diagnostic
                </h2>
                <p className="text-xs text-foreground/55">Compared against your last-60-posts baseline</p>
              </div>
              <button onClick={onClose} className="rounded-full p-1.5 text-foreground/60 transition hover:bg-black/5" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              {error ? (
                <div className="rounded-xl bg-black/[0.03] px-4 py-6 text-center text-sm text-foreground/60">
                  {error.kind === "too_recent" && "This post is too recent — diagnostics need at least 24h of insights data."}
                  {error.kind === "quota" && "AI quota exhausted for this month — diagnostics resume at the next reset."}
                  {error.kind === "other" && (
                    <>
                      Couldn't diagnose this post.
                      <button onClick={() => setAttempt((a) => a + 1)} className="btn-glow mx-auto mt-3 flex !px-3.5 !py-2 text-xs">
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </>
                  )}
                </div>
              ) : !diag ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/55">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing reach, timing, hashtags, and format…
                </div>
              ) : (
                <>
                  {!diag.underperformed && (
                    <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      This post actually beat your baseline — here's why it worked.
                    </p>
                  )}
                  <div className="divide-y divide-black/5 rounded-xl bg-black/[0.02] px-3">
                    <MetricRow label="Reach" base={diag.baseline.avg_reach} obs={diag.observed.avg_reach} />
                    <MetricRow label="Engagement rate" base={diag.baseline.avg_engagement_rate_pct} obs={diag.observed.avg_engagement_rate_pct} unit="%" />
                    <MetricRow label="Save rate" base={diag.baseline.avg_save_rate_pct} obs={diag.observed.avg_save_rate_pct} unit="%" />
                  </div>

                  <div className="mt-3 rounded-xl bg-violet/5 p-3 ring-1 ring-violet/15">
                    <AIMarkdown text={diag.verdict_md} />
                  </div>

                  {diag.factors.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {diag.factors.map((f) => <FactorRow key={f.key} factor={f} refId={diag.ig_media_id} />)}
                    </div>
                  )}

                  {diag.recommendations_md && (
                    <div className="mt-3 rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-200">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Recommendations</div>
                      <AIMarkdown text={diag.recommendations_md} className="mt-1" />
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end border-t border-black/5 pt-2.5">
                    <AIFeedback feature="diagnostic" refId={diag.ig_media_id} />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

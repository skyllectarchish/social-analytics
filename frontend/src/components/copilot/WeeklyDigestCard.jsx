import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { trackAI } from "../../utils/telemetry";
import {
  RefreshCcw,
  Loader2,
  Trophy,
  AlertTriangle,
  TrendingUp,
  FlaskConical,
  CalendarClock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAIDigest } from "../../hooks/useAIDigest";
import { useAIQuota } from "../../hooks/useAIQuota";
import AIMarkdown from "./AIMarkdown";
import AIStreamSurface from "./AIStreamSurface";
import AIFeedbackButtons from "./AIFeedbackButtons";
import AIEmptyState from "./AIEmptyState";

function Skeleton({ className = "" }) {
  return (
    <div
      className={`rounded ${className}`}
      style={{ background: "rgba(15,23,42,0.06)" }}
      aria-hidden="true"
    />
  );
}

const BULLET_KINDS = {
  win: {
    label: "Win",
    icon: Trophy,
    color: "#10b981",
    bg: "rgba(16,185,129,0.07)",
    border: "rgba(16,185,129,0.22)",
  },
  warning: {
    label: "Heads up",
    icon: AlertTriangle,
    color: "#b45309",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.24)",
  },
  trend: {
    label: "Trend",
    icon: TrendingUp,
    color: "#0284c7",
    bg: "rgba(14,165,233,0.07)",
    border: "rgba(14,165,233,0.22)",
  },
  experiment: {
    label: "Try this",
    icon: FlaskConical,
    color: "#7c3aed",
    bg: "rgba(139,92,246,0.07)",
    border: "rgba(139,92,246,0.22)",
  },
};

function formatWeekOf(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// Monday of the current UTC week — matches the backend's
// `_default_week_of()`. Used to clamp the Next-week button.
function todayMondayUTC() {
  const d = new Date();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function shiftWeek(weekOfISO, deltaDays) {
  if (!weekOfISO) return null;
  const d = new Date(`${weekOfISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatFreshness(generatedAt, cached) {
  if (!generatedAt) return null;
  const diffMs = Date.now() - new Date(generatedAt).getTime();
  if (Number.isNaN(diffMs)) return null;
  if (!cached) return "Just synthesized";
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "Last refreshed <1h ago";
  if (hours < 24) return `Last refreshed ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Last refreshed ${days}d ago`;
}

function buildRoute(link) {
  if (!link?.route) return null;
  const qs = link.query
    ? Object.entries(link.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";
  return qs ? `${link.route}?${qs}` : link.route;
}

function BulletCard({ bullet, weekOf }) {
  const navigate = useNavigate();
  const kind = BULLET_KINDS[bullet.kind] || BULLET_KINDS.trend;
  const Icon = kind.icon;
  const route = buildRoute(bullet.link);

  const handleNav = () => {
    if (!route) return;
    trackAI("digest", "bullet_link_clicked", {
      refId: weekOf,
      meta: { bullet_kind: bullet.kind, route: bullet.link?.route },
    });
    navigate(route);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.35, bounce: 0 }}
      className="rounded-xl p-3.5 flex flex-col gap-2"
      style={{ background: kind.bg, border: `1px solid ${kind.border}` }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "#fff", color: kind.color }}
        >
          <Icon size={12} />
        </div>
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: kind.color }}
        >
          {kind.label}
        </span>
      </div>
      <h4 className="text-[13px] font-semibold text-slate-900 leading-snug">
        {bullet.headline}
      </h4>
      {bullet.detail_md && (
        <div className="text-[12px] text-slate-600 leading-relaxed">
          <AIMarkdown source={bullet.detail_md} />
        </div>
      )}
      {route && (
        <button
          type="button"
          onClick={handleNav}
          className="text-[11px] font-medium mt-auto inline-flex items-center gap-1 self-start"
          style={{ color: kind.color, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          Open in dashboard →
        </button>
      )}
    </motion.div>
  );
}

function DigestSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-3/4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function WeeklyDigestCard({ weekOf, onWeekChange }) {
  const { digest, loading, error, isStreaming, streamingText, regenerate } = useAIDigest(weekOf);
  const currentMondayUTC = useMemo(todayMondayUTC, []);
  const canGoNext = !!weekOf && weekOf < currentMondayUTC;
  const goPrevWeek = () =>
    onWeekChange?.(shiftWeek(weekOf || currentMondayUTC, -7));
  const goNextWeek = () => {
    if (!canGoNext) return;
    onWeekChange?.(shiftWeek(weekOf, 7));
  };
  const { exhausted, resetsAt, used, limit } = useAIQuota();
  const renderedFiredRef = useRef(false);
  const regenStartRef = useRef(null);

  // Fire `rendered` once per (week_of, status) combination as soon as the
  // digest paints.
  useEffect(() => {
    if (!digest || loading || isStreaming) return;
    if (renderedFiredRef.current === digest.week_of) return;
    renderedFiredRef.current = digest.week_of;
    trackAI("digest", "rendered", {
      refId: digest.week_of,
      meta: { cached: !!digest.cached, status: digest.status },
    });
  }, [digest, loading, isStreaming]);

  // Fire success/failure once the stream settles. The ref captures the
  // weekOf at regen-start so a user navigating to a different week mid-stream
  // doesn't emit a spurious success event tagged with the wrong week.
  useEffect(() => {
    const inflight = regenStartRef.current;
    if (!inflight) return;
    if (isStreaming) return;
    const elapsed = Date.now() - inflight.startedAt;
    if (error) {
      trackAI("digest", "regenerate_failed", {
        refId: inflight.weekOf,
        meta: { error_code: "unknown" },
        latency_ms: elapsed,
      });
    } else {
      trackAI("digest", "regenerate_succeeded", {
        refId: inflight.weekOf,
        latency_ms: elapsed,
      });
    }
    regenStartRef.current = null;
  }, [isStreaming, error]);

  const handleRegenerate = () => {
    regenStartRef.current = { startedAt: Date.now(), weekOf };
    trackAI("digest", "regenerate_clicked", {
      refId: weekOf,
      meta: { quota_remaining: limit - used },
    });
    if (exhausted) {
      trackAI("quota", "exhausted_seen", { meta: { feature: "digest" } });
      return;
    }
    regenerate();
  };

  const freshness = useMemo(
    () => (digest ? formatFreshness(digest.generated_at, digest.cached) : null),
    [digest],
  );
  const weekLabel = useMemo(
    () => formatWeekOf(digest?.week_of ?? weekOf),
    [digest, weekOf],
  );

  const status = digest?.status;
  const showStreaming = isStreaming || status === "generating";
  // The /weekly endpoint returns a 'stale' placeholder with empty
  // narrative/bullets for any week that hasn't been synthesized yet.
  // Treat anything with no rendered content as empty, not just
  // not_enough_data — otherwise the body renders as a blank div.
  const hasContent =
    !!digest?.narrative_md?.trim() || (digest?.bullets?.length ?? 0) > 0;
  const showEmpty = !loading && !error && !showStreaming && !hasContent;

  return (
    <motion.section
      aria-labelledby="weekly-digest-title"
      aria-busy={loading || isStreaming || undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0 }}
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "var(--shadow-soft)",
        padding: "1.25rem 1.5rem",
      }}
    >
      <header className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              id="weekly-digest-title"
              className="text-base font-semibold text-slate-900"
            >
              Weekly Digest
            </h2>
            {weekLabel && (
              <div className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                {onWeekChange && (
                  <button
                    type="button"
                    onClick={goPrevWeek}
                    disabled={isStreaming}
                    title="Previous week"
                    aria-label="Previous week"
                    className="p-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                    style={{ background: "none", border: "none", cursor: isStreaming ? "not-allowed" : "pointer", color: "#64748b" }}
                  >
                    <ChevronLeft size={13} />
                  </button>
                )}
                <span className="inline-flex items-center gap-1 px-0.5">
                  <CalendarClock size={11} />
                  Week of {weekLabel}
                </span>
                {onWeekChange && (
                  <button
                    type="button"
                    onClick={goNextWeek}
                    disabled={!canGoNext || isStreaming}
                    title={canGoNext ? "Next week" : "Already on the current week"}
                    aria-label="Next week"
                    className="p-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                    style={{ background: "none", border: "none", cursor: canGoNext && !isStreaming ? "pointer" : "not-allowed", color: "#64748b" }}
                  >
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
          {freshness && (
            <p className="text-[11px] text-slate-500 mt-1">{freshness}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isStreaming || exhausted}
          title={
            exhausted
              ? `At quota · Resets ${resetsAt ? new Date(resetsAt).toLocaleDateString() : "soon"}`
              : "Regenerate · 1 AI call"
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
          style={{
            background: exhausted || isStreaming ? "rgba(15,23,42,0.04)" : "rgba(139,92,246,0.10)",
            color: exhausted || isStreaming ? "#94a3b8" : "#7c3aed",
            border: `1px solid ${
              exhausted || isStreaming ? "rgba(15,23,42,0.08)" : "rgba(139,92,246,0.20)"
            }`,
            cursor: exhausted || isStreaming ? "not-allowed" : "pointer",
          }}
        >
          {isStreaming ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCcw size={12} />
          )}
          {exhausted ? "At quota" : isStreaming ? "Synthesizing…" : "Regenerate"}
        </button>
      </header>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-[12px] flex items-center gap-2 mb-3"
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

      {loading && <DigestSkeleton />}

      {showEmpty && !loading && (
        status === "not_enough_data" ? (
          <AIEmptyState
            icon={CalendarClock}
            title="Not enough history yet"
            body="We need at least 7 days of posting history before the weekly digest can find patterns. Post a few more times — we'll catch up."
          />
        ) : (
          <AIEmptyState
            icon={CalendarClock}
            title="No digest for this week yet"
            body={
              exhausted
                ? "Monthly AI quota is exhausted. Synthesis will be available after your quota resets."
                : "Click Regenerate to synthesize one (1 AI call). If this week has no posts, the result will say so."
            }
          />
        )
      )}

      {!loading && !showEmpty && (
        <div className="space-y-5">
          {showStreaming ? (
            <AIStreamSurface
              text={streamingText || ""}
              isStreaming
              minHeight={120}
              className={digest ? "opacity-90" : ""}
            />
          ) : (
            digest?.narrative_md && (
              <div>
                <AIMarkdown source={digest.narrative_md} />
              </div>
            )
          )}

          {digest?.bullets?.length > 0 && !showStreaming && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {digest.bullets.map((bullet, i) => (
                <BulletCard
                  key={`${bullet.kind}-${i}`}
                  bullet={bullet}
                  weekOf={digest.week_of}
                />
              ))}
            </div>
          )}

          {digest?.followups?.length > 0 && !showStreaming && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Worth trying next
              </p>
              <div className="flex flex-wrap gap-2">
                {digest.followups.map((tip, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center text-[12px] px-2.5 py-1 rounded-full"
                    style={{
                      background: "rgba(15,23,42,0.04)",
                      color: "#475569",
                      border: "1px solid rgba(15,23,42,0.06)",
                    }}
                  >
                    {tip}
                  </span>
                ))}
              </div>
            </div>
          )}

          {digest && !showStreaming && (
            <div className="pt-3 border-t border-slate-100">
              <AIFeedbackButtons
                feature="digest"
                refId={digest.week_of}
                promptLabel="Was this digest useful?"
              />
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

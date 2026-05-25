import { useState } from "react";
import { AlertCircle, Sparkles, Loader2, MessageCircle } from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import {
  useSeedSentimentDemo,
  useSentimentDiagnose,
} from "../../hooks/useSentiment";

/**
 * Renders only when the Audience Voice section has no data to show.
 *
 * Explains the cause from the backend diagnose endpoint (most often:
 * Meta hasn't approved Advanced Access for instagram_business_manage_comments
 * so the comment payloads come back empty even though comments_count is
 * non-zero). Offers a one-click "Seed demo data" CTA so users can see the
 * section work while sorting out Meta App Review.
 *
 * Demo rows are tagged synthetic_v1 / synth_* — `/api/instagram/purge?synth_only=true`
 * cleans them up without touching real synced rows.
 */
export default function VoiceEmptyBanner() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading } = useSentimentDiagnose(refreshKey);
  const { trigger, seeding, error, result } = useSeedSentimentDemo();

  if (loading || !data) return null;
  // Section already has data — don't render the banner at all.
  if (data.status === "ok" && data.stored_comments > 0) return null;

  const isScopeBlocked = data.status === "scope_blocked";
  const isNoData = data.status === "no_data";

  async function onSeed() {
    try {
      await trigger();
      // Reload to refresh page-level data hooks that don't expose a refetch
      // handle. Heavy but predictable; better than leaving stale empty-state.
      setRefreshKey((k) => k + 1);
      window.location.reload();
    } catch {
      // error already captured by the hook
    }
  }

  return (
    <AnimatedCard className="p-5 mb-4" delay={0.04}>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: isScopeBlocked
              ? "rgba(245,158,11,0.12)"
              : "rgba(139,92,246,0.10)",
          }}
        >
          {isScopeBlocked ? (
            <AlertCircle size={18} className="text-amber-600" />
          ) : (
            <MessageCircle size={18} className="text-violet-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            {isScopeBlocked
              ? "Comment data isn't reaching us yet"
              : isNoData
                ? "No comments to analyse yet"
                : "Audience Voice is loading"}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {data.reason}
          </p>

          {isScopeBlocked && (
            <details className="mt-2 text-[11px] text-slate-500">
              <summary className="cursor-pointer text-violet-600 font-medium">
                What does that mean?
              </summary>
              <p className="mt-2 leading-relaxed">
                Instagram&apos;s comment-read scope (
                <code className="text-[10px] bg-slate-100 px-1 rounded">
                  instagram_business_manage_comments
                </code>
                ) needs Meta App Review approval before it works on accounts
                that aren&apos;t registered test users. We see{" "}
                <strong>{(data.ig_comments_total ?? 0).toLocaleString()}</strong>{" "}
                comments on your posts via the count endpoint, but the
                content endpoint is returning empty pages. Two fixes:
              </p>
              <ol className="list-decimal pl-5 mt-1 space-y-0.5">
                <li>
                  Add your Instagram account as a tester in your Meta app
                  (Developers → App → Roles → Instagram Testers), then
                  re-connect.
                </li>
                <li>
                  Submit App Review for the comments scope to enable
                  production access on every connected account.
                </li>
              </ol>
            </details>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={onSeed}
              disabled={seeding}
              className="text-xs px-3 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {seeding ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Seeding…
                </>
              ) : (
                <>
                  <Sparkles size={12} /> Seed demo data
                </>
              )}
            </button>
            <span className="text-[10px] text-slate-400 leading-tight">
              Adds synthetic comments / sentiment / topics so you can preview
              the section. Tagged synthetic — clean up with{" "}
              <code className="bg-slate-100 px-1 rounded">
                /api/instagram/purge?synth_only=true
              </code>
              .
            </span>
          </div>

          {error && (
            <p className="text-[11px] text-rose-500 mt-2">{error}</p>
          )}
          {result && (
            <p className="text-[11px] text-emerald-600 mt-2">
              Seeded {result.comments} comments, {result.sentiment} sentiment
              rows, {result.topics} topic clusters. Reloading…
            </p>
          )}
        </div>
      </div>
    </AnimatedCard>
  );
}

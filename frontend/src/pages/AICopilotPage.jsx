import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import AIQuotaBadge from "../components/copilot/AIQuotaBadge";
import WeeklyDigestCard from "../components/copilot/WeeklyDigestCard";
import ContentIdeasPanel from "../components/copilot/ContentIdeasPanel";
import PostDiagnosticDrawer from "../components/copilot/PostDiagnosticDrawer";
import CaptionStudioDialog from "../components/copilot/CaptionStudioDialog";
import FirstVisitDisclosure, {
  hasAckedDisclosure,
} from "../components/copilot/FirstVisitDisclosure";
import { trackAI } from "../utils/telemetry";
import { flagOn, anyAIOn } from "../utils/featureFlags";

// Matches backend `_default_week_of()` — Monday of the current ISO
// week in UTC. The digest API keys cache rows by this date.
function todayMondayUTC() {
  const d = new Date();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

export default function AICopilotPage() {
  const [captionStudioOpen, setCaptionStudioOpen] = useState(false);
  const [diagnosticMedia, setDiagnosticMedia] = useState(null);
  const [weekOf, setWeekOf] = useState(() => todayMondayUTC());

  // Recompute the current Monday when the tab regains focus so a long-lived
  // session crossing midnight UTC doesn't stay stuck on last week's digest.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const fresh = todayMondayUTC();
        setWeekOf((prev) => (prev === fresh ? prev : fresh));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Page view — gated on disclosure ack so the first event after acking
  // reflects the actual page render, not a still-modal view.
  useEffect(() => {
    if (hasAckedDisclosure()) {
      trackAI("copilot_nav", "viewed", { meta: { source: "direct" } });
    }
  }, []);

  const handleSourcePostClick = useCallback((igMediaId, sourcePost) => {
    setDiagnosticMedia({
      ig_media_id: igMediaId,
      permalink: sourcePost?.permalink,
      thumbnail_url: sourcePost?.thumbnail_url,
      caption_preview: sourcePost?.caption_preview,
    });
    trackAI("diagnostic", "opened", {
      refId: igMediaId,
      meta: { source: "Ideas" },
    });
  }, []);

  // Hard guard: someone deep-links to /dashboard/copilot while every AI
  // flag is off. Show a friendly notice rather than a blank page.
  if (!anyAIOn()) {
    return (
      <DashboardLayout>
        <div className="lab-grid">
          <PageHeader
            title="InsightIQ"
            emoji="✦"
            subtitle="Coming soon to your account."
            showComparator={false}
          />
          <div className="d-card p-8 text-center text-[13px] text-slate-500">
            InsightIQ isn't available on your account yet.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FirstVisitDisclosure
        onAck={() =>
          trackAI("copilot_nav", "viewed", { meta: { source: "post_disclosure" } })
        }
      />

      <div className="lab-grid">
        <PageHeader
          title="InsightIQ"
          emoji="✦"
          subtitle="Synthesizes your week and suggests what to make next."
          showComparator={false}
          actions={
            <div className="flex items-center gap-3">
              <AIQuotaBadge variant="compact" />
              {flagOn("ai_caption") && (
                <button
                  type="button"
                  onClick={() => {
                    trackAI("caption", "opened", { meta: { source: "InsightIQ" } });
                    setCaptionStudioOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(109,40,217,0.22)",
                  }}
                >
                  <Sparkles size={12} />
                  Caption Studio
                </button>
              )}
            </div>
          }
        />

        <div className="space-y-9">
          {flagOn("ai_digest") && (
            <WeeklyDigestCard weekOf={weekOf} onWeekChange={setWeekOf} />
          )}
          {flagOn("ai_ideas") && (
            <ContentIdeasPanel onSourcePostClick={handleSourcePostClick} />
          )}
        </div>
      </div>

      {flagOn("ai_diagnostic") && (
        <PostDiagnosticDrawer
          media={diagnosticMedia}
          onClose={() => setDiagnosticMedia(null)}
        />
      )}
      {flagOn("ai_caption") && (
        <CaptionStudioDialog
          open={captionStudioOpen}
          onClose={() => setCaptionStudioOpen(false)}
        />
      )}
    </DashboardLayout>
  );
}

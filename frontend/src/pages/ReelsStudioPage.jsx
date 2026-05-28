import { lazy, Suspense, useState } from "react";
import { Sparkles } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import ReelsHeroMetrics from "../components/reels-studio/ReelsHeroMetrics";
import HookStrengthTrend from "../components/reels-studio/HookStrengthTrend";
import ReelsRetentionTable from "../components/reels-studio/ReelsRetentionTable";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import SyncButton from "../components/dashboard/SyncButton";
import { trackAI } from "../utils/telemetry";
import { flagOn } from "../utils/featureFlags";

const PostDiagnosticDrawer = lazy(() =>
  import("../components/copilot/PostDiagnosticDrawer"),
);
const CaptionStudioDialog = lazy(() =>
  import("../components/copilot/CaptionStudioDialog"),
);

export default function ReelsStudioPage() {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [diagnosticMedia, setDiagnosticMedia] = useState(null);
  const [captionStudioOpen, setCaptionStudioOpen] = useState(false);

  return (
    <DashboardLayout>
      <PageHeader
        title="Reels Studio"
        emoji="🎬"
        subtitle="Track hook strength, watch time, and retention across all your Reels."
        actions={
          <div className="flex items-center gap-2">
            {flagOn("ai_caption") && (
              <button
                type="button"
                onClick={() => {
                  trackAI("caption", "opened", { meta: { source: "ReelsStudio" } });
                  setCaptionStudioOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                style={{
                  background: "rgba(139,92,246,0.10)",
                  color: "#7c3aed",
                  border: "1px solid rgba(139,92,246,0.20)",
                  cursor: "pointer",
                }}
                title="Score and rewrite a caption"
              >
                <Sparkles size={12} />
                Caption Studio
              </button>
            )}
            <SyncButton />
          </div>
        }
      />

      <div className="space-y-3">
        <ReelsHeroMetrics />
        <HookStrengthTrend />
        <ReelsRetentionTable onSelect={setSelectedMedia} />
      </div>

      <PostInsightsDrawer
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onDiagnose={(m) => {
          setSelectedMedia(null);
          setDiagnosticMedia(m);
        }}
      />
      <Suspense fallback={null}>
        <PostDiagnosticDrawer media={diagnosticMedia} onClose={() => setDiagnosticMedia(null)} />
        {flagOn("ai_caption") && (
          <CaptionStudioDialog
            open={captionStudioOpen}
            onClose={() => setCaptionStudioOpen(false)}
            initialFormat="REELS"
          />
        )}
      </Suspense>
    </DashboardLayout>
  );
}
